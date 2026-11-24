"""Turn an uploaded video into something models can 'watch'.

Language models can't play a video, so each checkpoint (hook 0-3s, middle 3-10s,
end 10s+) becomes: one key frame (JPEG), the transcript said in that window, and a
one-line text description of the frame (for models without image input).
"""
from __future__ import annotations

import asyncio
import json
import shutil
import subprocess
from pathlib import Path
from typing import Any

from openai import AsyncOpenAI

from . import config, llm

FFMPEG = shutil.which("ffmpeg") or "ffmpeg"
FFPROBE = shutil.which("ffprobe") or "ffprobe"


def _run(args: list[str]) -> subprocess.CompletedProcess:
    return subprocess.run(args, capture_output=True, text=True, check=False)


def probe(path: Path) -> dict[str, Any]:
    out = _run([FFPROBE, "-v", "error", "-show_entries", "format=duration:stream=codec_type,width,height",
                "-of", "json", str(path)])
    info = json.loads(out.stdout or "{}")
    streams = info.get("streams", [])
    video = next((s for s in streams if s.get("codec_type") == "video"), {})
    return {
        "duration": float(info.get("format", {}).get("duration", 0) or 0),
        "has_audio": any(s.get("codec_type") == "audio" for s in streams),
        "width": video.get("width"),
        "height": video.get("height"),
    }


def checkpoints(duration: float) -> list[dict[str, Any]]:
    cps = [{"label": "hook", "start": 0.0, "end": min(3.0, duration)}]
    if duration > 3:
        cps.append({"label": "middle", "start": 3.0, "end": min(10.0, duration)})
    if duration > 10:
        cps.append({"label": "end", "start": 10.0, "end": duration})
    return cps


def extract_frame(path: Path, t: float, out: Path) -> bytes:
    _run([FFMPEG, "-y", "-v", "error", "-ss", f"{t:.2f}", "-i", str(path), "-frames:v", "1",
          "-vf", "scale=512:-2", "-q:v", "4", str(out)])
    return out.read_bytes() if out.exists() else b""


def extract_audio(path: Path, out: Path) -> bool:
    _run([FFMPEG, "-y", "-v", "error", "-i", str(path), "-vn", "-ac", "1", "-ar", "16000",
          "-b:a", "48k", str(out)])
    return out.exists() and out.stat().st_size > 1000


async def transcribe(audio: Path) -> list[dict[str, Any]]:
    """Segments with start/end seconds, via OpenAI whisper-1 (the Neon gateway has no audio)."""
    if not config.OPENAI_API_KEY:
        return []
    try:
        client = AsyncOpenAI(api_key=config.OPENAI_API_KEY, timeout=30, max_retries=1)
        with audio.open("rb") as f:
            res = await asyncio.wait_for(client.audio.transcriptions.create(
                model="whisper-1", file=f, response_format="verbose_json",
                timestamp_granularities=["segment"],
            ), timeout=45)
        return [{"start": s.start, "end": s.end, "text": s.text.strip()} for s in (res.segments or [])]
    except Exception as exc:  # no audio track, quota, network
        print(f"[video] transcription skipped: {exc}")
        return []


async def describe_frame(jpeg: bytes) -> str:
    if config.MOCK or not jpeg:
        return "A frame from the launch video."
    try:
        res = await llm.ask_json(
            config.CAPTION_MODEL,
            "You describe video frames for people who cannot see them. Be concrete and short.",
            [{"type": "text", "text": 'Describe this frame in one sentence (max 25 words): who/what is on '
                                     'screen, any on-screen text, mood. Reply as JSON {"caption": "..."}'},
             llm.image_part(jpeg)],
            max_tokens=600,
        )
        return str(res["data"].get("caption", "")).strip() or "A frame from the launch video."
    except Exception as exc:
        print(f"[video] caption failed: {exc}")
        return "A frame from the launch video."


async def analyze(video_id: str, path: Path) -> dict[str, Any]:
    meta = await asyncio.to_thread(probe, path)
    cps = checkpoints(meta["duration"] or 15.0)
    frame_dir = config.FRAME_DIR / video_id
    frame_dir.mkdir(parents=True, exist_ok=True)

    async def frame_for(i: int, cp: dict[str, Any]) -> None:
        t = cp["start"] + (cp["end"] - cp["start"]) * 0.5
        jpeg = await asyncio.to_thread(extract_frame, path, t, frame_dir / f"cp{i}.jpg")
        cp["frame_path"] = str(frame_dir / f"cp{i}.jpg") if jpeg else ""
        cp["caption"] = await describe_frame(jpeg)

    segments: list[dict[str, Any]] = []
    if meta["has_audio"]:
        audio = frame_dir / "audio.mp3"
        if await asyncio.to_thread(extract_audio, path, audio):
            segments = await transcribe(audio)

    await asyncio.gather(*(frame_for(i, cp) for i, cp in enumerate(cps)))
    for cp in cps:
        cp["transcript"] = " ".join(
            s["text"] for s in segments if s["start"] < cp["end"] and s["end"] > cp["start"]
        ).strip()

    analysis = {"video_id": video_id, **meta, "checkpoints": cps, "segments": segments}
    (frame_dir / "analysis.json").write_text(json.dumps(analysis, indent=2), encoding="utf-8")
    return analysis


def make_sample(out: Path, seconds: int = 15) -> None:
    """A synthetic vertical test video (color bars + tone) for trying the pipeline."""
    _run([FFMPEG, "-y", "-v", "error",
          "-f", "lavfi", "-i", f"testsrc2=size=720x1280:rate=30:duration={seconds}",
          "-f", "lavfi", "-i", f"sine=frequency=440:duration={seconds}",
          "-shortest", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", str(out)])
