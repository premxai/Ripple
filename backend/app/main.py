"""Ripple API.

Run:  uv run uvicorn app.main:app --reload --port 8000   (from ripple/backend)

Flow: POST /api/videos (upload v1) -> POST /api/runs (round 1) -> events stream on /ws
      -> panel review arrives -> POST /api/runs/{id}/answer -> upload v2 -> POST /api/runs
      with prev_run_id (round 2) -> final report event.
"""
from __future__ import annotations

import asyncio
import hashlib
import traceback
import uuid
from pathlib import Path
from typing import Any

from fastapi import FastAPI, File, Form, HTTPException, UploadFile, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from openai import AsyncOpenAI
from pydantic import BaseModel

from . import analytics, config, panel, sim, video
from .events import bus
from .integrations import band, telem
from .personas import PANEL_BY_ID, RESIDENTS, town_payload

app = FastAPI(title="Ripple")
app.add_middleware(CORSMiddleware, allow_origins=config.FRONTEND_ORIGINS, allow_methods=["*"],
                   allow_headers=["*"])
app.mount("/media", StaticFiles(directory=config.VIDEO_DIR), name="media")

VIDEOS: dict[str, dict[str, Any]] = {}
RUNS: dict[str, dict[str, Any]] = {}


def _public_video(v: dict[str, Any]) -> dict[str, Any]:
    a = v["analysis"]
    return {"video_id": v["video_id"], "url": v["url"], "duration": a["duration"],
            "width": a.get("width"), "height": a.get("height"),
            "checkpoints": [{k: cp.get(k) for k in ("label", "start", "end", "caption", "transcript")}
                            for cp in a["checkpoints"]]}


@app.get("/api/health")
async def health() -> dict[str, Any]:
    return {"ok": True, "mock": config.MOCK, "residents": len(RESIDENTS),
            "labs": len({r.lab.split(" ")[0] for r in RESIDENTS}),
            "telem": telem.enabled(), "band": band.enabled(), "bruin": bool(config.BRUIN_CMD),
            "voices": bool(config.OPENAI_API_KEY)}


@app.get("/api/town")
async def town() -> dict[str, Any]:
    return town_payload()


async def _register(video_id: str, path: Path) -> dict[str, Any]:
    analysis = await video.analyze(video_id, path)
    VIDEOS[video_id] = {"video_id": video_id, "path": str(path), "url": f"/media/{path.name}",
                        "analysis": analysis}
    return _public_video(VIDEOS[video_id])


@app.post("/api/videos")
async def upload_video(file: UploadFile = File(...)) -> dict[str, Any]:
    video_id = uuid.uuid4().hex[:10]
    suffix = Path(file.filename or "video.mp4").suffix or ".mp4"
    path = config.VIDEO_DIR / f"{video_id}{suffix}"
    path.write_bytes(await file.read())
    return await _register(video_id, path)


@app.post("/api/videos/sample")
async def sample_video() -> dict[str, Any]:
    video_id = "sample-" + uuid.uuid4().hex[:6]
    path = config.VIDEO_DIR / f"{video_id}.mp4"
    await asyncio.to_thread(video.make_sample, path)
    if not path.exists():
        raise HTTPException(500, "ffmpeg could not create the sample video")
    return await _register(video_id, path)


class RunRequest(BaseModel):
    video_id: str
    caption: str = ""
    prev_run_id: str | None = None


@app.post("/api/runs")
async def start_run(req: RunRequest) -> dict[str, Any]:
    if req.video_id not in VIDEOS:
        raise HTTPException(404, "unknown video_id")
    prev = RUNS.get(req.prev_run_id or "")
    round_no = (prev["round"] + 1) if prev else 1
    run_id = f"r{round_no}-{uuid.uuid4().hex[:8]}"
    RUNS[run_id] = {"run_id": run_id, "video_id": req.video_id, "caption": req.caption, "round": round_no,
                    "version": f"v{round_no}", "prev": req.prev_run_id, "status": "running"}
    asyncio.create_task(_run_pipeline(run_id))
    return {"run_id": run_id, "round": round_no}


async def _run_pipeline(run_id: str) -> None:
    run = RUNS[run_id]
    v = VIDEOS[run["video_id"]]
    prev = RUNS.get(run["prev"] or "")
    try:
        memory = prev["result"].memory if prev and prev.get("result") else {}
        result = await sim.run_round(run_id, run["round"], run["version"], v["analysis"], run["caption"], memory)
        run["result"] = result
        if config.BRUIN_CMD:
            # Analytics are a bonus: a Bruin failure must never stop the panel review.
            try:
                out = await analytics.refresh()
            except Exception as exc:
                out = {"ok": False, "tail": str(exc)}
            await bus.emit(run_id, "bruin_refresh", round=run["round"], actor_kind="system",
                           action="ok" if out.get("ok") else "failed", reason=str(out.get("tail", ""))[-300:])
        run["review"] = await panel.review(run_id, v["analysis"], run["caption"], result)
        if prev and prev.get("result"):
            run["report"] = await panel.final_report(run_id, prev["result"], result)
        run["status"] = "done"
    except Exception as exc:
        traceback.print_exc()
        run["status"] = "error"
        await bus.emit(run_id, "error", round=run["round"], actor_kind="system", reason=str(exc)[:300])


class AnswerRequest(BaseModel):
    panelist_id: str = "creative_director"
    question: str
    answer: str


@app.post("/api/runs/{run_id}/answer")
async def answer(run_id: str, req: AnswerRequest) -> dict[str, Any]:
    run = RUNS.get(run_id)
    if not run or not run.get("result"):
        raise HTTPException(404, "run not finished")
    v = VIDEOS[run["video_id"]]
    trends = (run.get("review") or {}).get("trends", [])
    ev_text = panel.evidence(v["analysis"], run["caption"], run["result"], trends, [])
    return await panel.answer(run_id, run["round"], run["version"], ev_text, req.panelist_id, req.question,
                              req.answer)


@app.get("/api/runs/{run_id}/events")
async def run_events(run_id: str) -> list[dict[str, Any]]:
    return bus.history.get(run_id, [])


@app.get("/api/tts")
async def tts(panelist: str, text: str) -> FileResponse:
    """Panel voices via OpenAI gpt-4o-mini-tts (the Neon gateway has no audio). Cached on disk."""
    p = PANEL_BY_ID.get(panelist)
    if not p or not config.OPENAI_API_KEY:
        raise HTTPException(404, "voice unavailable")
    text = text[:600]
    key = hashlib.sha1(f"{panelist}:{text}".encode()).hexdigest()[:16]
    out = config.TTS_DIR / f"{key}.mp3"
    if not out.exists():
        client = AsyncOpenAI(api_key=config.OPENAI_API_KEY, timeout=30, max_retries=1)
        resp = await client.audio.speech.create(model=config.TTS_MODEL, voice=p.voice, input=text,
                                                instructions=p.voice_style)
        out.write_bytes(resp.content)
    return FileResponse(out, media_type="audio/mpeg")


@app.post("/api/analytics/refresh")
async def analytics_refresh() -> dict[str, Any]:
    return await analytics.refresh()


@app.get("/api/analytics/{table}")
async def analytics_table(table: str, run_id: str | None = None) -> list[dict[str, Any]]:
    try:
        return analytics.read(table, run_id)
    except ValueError as exc:
        raise HTTPException(404, str(exc)) from exc
    except Exception as exc:
        raise HTTPException(503, f"analytics not ready: {exc}") from exc


@app.websocket("/ws")
async def ws(socket: WebSocket) -> None:
    await socket.accept()
    q = bus.subscribe()
    try:
        while True:
            await socket.send_json(await q.get())
    except (WebSocketDisconnect, RuntimeError):
        pass
    finally:
        bus.unsubscribe(q)
