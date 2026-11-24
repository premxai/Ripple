"""Runware: image generation for resident/panel portraits (and other art).

API (https://runware.ai/docs/en/getting-started/how-to-connect, checked 2026-11-23):
  POST https://api.runware.ai/v1   Authorization: Bearer <RUNWARE_API_KEY>
  body: a JSON array of tasks, e.g. [{"taskType": "imageInference", "taskUUID": <uuid4>,
        "model": "runware:101@1", "positivePrompt": ..., "width": 512, "height": 512, ...}]
  response: {"data": [{"imageURL": ...}]}  or  {"errors": [{"code", "message", ...}]}

Run `uv run python -m app.integrations.runware` from ripple/backend to (re)generate
portraits into ripple/frontend/public/avatars/<id>.png. The UI picks them up automatically.
"""
from __future__ import annotations

import asyncio
import sys
import uuid
from pathlib import Path
from typing import Any

import httpx

from .. import config
from ..personas import PANEL, RESIDENTS

API = "https://api.runware.ai/v1"
MODEL = "runware:101@1"  # FLUX.1 [dev]
AVATAR_DIR = config.ROOT / "frontend" / "public" / "avatars"

STYLE = ("cute stylized 3D clay character portrait, head and shoulders, centered, soft studio lighting, "
         "smooth matte materials, friendly expression, Pixar-like toy figure, plain solid {bg} background, "
         "high detail, clean, no text")


def api_key() -> str:
    return config.env("RUNWARE_API_KEY")


def enabled() -> bool:
    return bool(api_key())


async def generate(prompt: str, width: int = 512, height: int = 512, seed: int | None = None) -> bytes:
    task: dict[str, Any] = {
        "taskType": "imageInference",
        "taskUUID": str(uuid.uuid4()),
        "model": MODEL,
        "positivePrompt": prompt,
        "width": width,
        "height": height,
        "steps": 28,
        "numberResults": 1,
        "outputType": "URL",
        "outputFormat": "PNG",
    }
    if seed is not None:
        task["seed"] = seed
    async with httpx.AsyncClient(timeout=120) as client:
        r = await client.post(API, json=[task], headers={"Authorization": f"Bearer {api_key()}"})
        body = r.json()
        if r.status_code >= 400 or "errors" in body:
            raise RuntimeError(f"Runware HTTP {r.status_code}: {body.get('errors')}")
        img = await client.get(body["data"][0]["imageURL"])
        img.raise_for_status()
        return img.content


def _resident_prompt(r) -> str:
    bg = {"#0EA5A4": "pale teal"}.get(r.color, "soft pastel")
    return (f"{STYLE.format(bg=bg)}. Character: {r.name}, {r.age} years old, {r.tag.lower()}. {r.bio} "
            f"Outfit accent color {r.color}.")


def _panel_prompt(p) -> str:
    looks = {
        "creative_director": "a stylish creative director with round glasses and a black turtleneck",
        "algorithm": "a friendly small white robot with a glowing teal screen face, no human features",
        "trend_scout": "an energetic young trend scout in a green cap and hoodie holding a phone",
    }
    return f"{STYLE.format(bg='off-white')}. Character: {looks.get(p.id, p.role)}."


async def make_avatars(only: list[str] | None = None) -> None:
    AVATAR_DIR.mkdir(parents=True, exist_ok=True)
    jobs = [(r.id, _resident_prompt(r)) for r in RESIDENTS] + [(p.id, _panel_prompt(p)) for p in PANEL]
    if only:
        jobs = [j for j in jobs if j[0] in only]
    sem = asyncio.Semaphore(4)

    async def one(pid: str, prompt: str) -> None:
        async with sem:
            try:
                data = await generate(prompt, seed=abs(hash(pid)) % 10_000_000)
                (AVATAR_DIR / f"{pid}.png").write_bytes(data)
                print(f"ok   {pid} ({len(data) // 1024} KB)")
            except Exception as exc:
                print(f"FAIL {pid}: {exc}")

    await asyncio.gather(*(one(pid, prompt) for pid, prompt in jobs))


if __name__ == "__main__":
    if not enabled():
        sys.exit("Set RUNWARE_API_KEY first.")
    asyncio.run(make_avatars(sys.argv[1:] or None))
