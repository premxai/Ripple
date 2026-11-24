"""One place for every model call. Each agent names its own model on the Neon AI Gateway.

Lessons from testing the gateway (2026-11-23):
- Claude models reject `response_format`, so we ask for JSON in the prompt and parse it.
- Reasoning models (kimi, grok-4-6, glm, qwen) need a big `max_tokens` or they return empty text.
- Slow models take 4-7s; every call has a timeout and falls back to a fast model.
"""
from __future__ import annotations

import asyncio
import base64
import json
import time
from typing import Any

from openai import AsyncOpenAI

from . import config

_client: AsyncOpenAI | None = None


def client() -> AsyncOpenAI:
    global _client
    if _client is None:
        _client = AsyncOpenAI(
            base_url=f"{config.NEON_BASE_URL}/v1",
            api_key=config.NEON_TOKEN,
            timeout=config.CALL_TIMEOUT + 5,
            max_retries=0,
        )
    return _client


def parse_json(text: str) -> dict[str, Any]:
    if not text:
        raise ValueError("empty model output")
    start, end = text.find("{"), text.rfind("}")
    if start < 0 or end <= start:
        raise ValueError(f"no JSON object in: {text[:120]!r}")
    return json.loads(text[start : end + 1])


def image_part(jpeg_bytes: bytes) -> dict[str, Any]:
    b64 = base64.b64encode(jpeg_bytes).decode()
    return {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{b64}"}}


async def ask_json(
    model: str,
    system: str,
    user: str | list[dict[str, Any]],
    *,
    max_tokens: int = 2000,
    timeout: float | None = None,
) -> dict[str, Any]:
    """Call `model`, fall back to the fast model on error or timeout.

    Returns {"data": <parsed JSON>, "model": <model used>, "latency_ms": int, "fallback": bool}.
    """
    timeout = timeout or config.CALL_TIMEOUT
    chain = [model] if model == config.FALLBACK_MODEL else [model, config.FALLBACK_MODEL]
    last_error: Exception | None = None
    for attempt, name in enumerate(chain):
        started = time.perf_counter()
        try:
            resp = await asyncio.wait_for(
                client().chat.completions.create(
                    model=name,
                    messages=[
                        {"role": "system", "content": system},
                        {"role": "user", "content": user},
                    ],
                    max_tokens=max_tokens,
                ),
                timeout=timeout,
            )
            data = parse_json(resp.choices[0].message.content or "")
            return {
                "data": data,
                "model": name,
                "latency_ms": int((time.perf_counter() - started) * 1000),
                "fallback": attempt > 0,
            }
        except Exception as exc:  # timeout, HTTP error, bad JSON
            last_error = exc
    raise RuntimeError(f"all models failed for {model}: {last_error}")
