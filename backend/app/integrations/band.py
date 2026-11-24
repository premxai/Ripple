"""BAND: each community in town is a BAND room (chat). Shares become real messages there.

Setup (once, ~10 min):
  1. app.band.ai -> Agents -> "Connect remote agent" for each resident + panelist.
     Copy each agent's ID and API key (shown once).
  2. Create one room per community (campus, creators, founders, parents, gym) plus
     "panel-back-room" and "town-hall", and add the agents (and yourself) to them.
  3. Fill ripple/band_agents.json (gitignored) like band_agents.example.json.

API (from https://docs.band.ai, checked 2026-11-23):
  POST https://api.band.ai/api/v1/agent/chats/{chat_id}/messages   header X-API-Key: <agent key>
  body {"message": {"content": "...", "mentions": [{"handle": "..."}]}}
  At least one mention is required, and agents only react when mentioned.
If band_agents.json is missing, every call is a no-op so the rest of Ripple still runs.
"""
from __future__ import annotations

import json
from typing import Any

import httpx

from .. import config

API = config.env("RIPPLE_BAND_BASE", "https://app.band.ai").rstrip("/") + "/api/v1/agent"
_cfg: dict[str, Any] | None = None


def _config() -> dict[str, Any]:
    global _cfg
    if _cfg is None:
        try:
            _cfg = json.loads(config.BAND_CONFIG.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            _cfg = {}
    return _cfg


def _filled(value: Any) -> bool:
    return bool(value) and not str(value).startswith("PASTE")


def _agents() -> dict[str, Any]:
    """Only agents whose ID and key have been filled in (handle is optional: mentions use the ID)."""
    return {k: v for k, v in _config().get("agents", {}).items()
            if all(_filled(v.get(f)) for f in ("agent_id", "api_key"))}


def _rooms() -> dict[str, str]:
    return {k: v for k, v in _config().get("rooms", {}).items() if _filled(v)}


def enabled() -> bool:
    return bool(_agents()) and bool(_rooms())


async def post(author_id: str, room: str, content: str, mention_ids: list[str]) -> bool:
    """Post `content` to `room` as agent `author_id`, mentioning `mention_ids` (persona ids)."""
    agents = _agents()
    agent = agents.get(author_id)
    chat_id = _rooms().get(room)
    if not (agent and chat_id):
        return False
    targets = [agents[m] for m in mention_ids if m in agents and m != author_id]
    if not targets:
        return False  # BAND requires at least one mention
    names = [("@" + t["handle"].lstrip("@")) if _filled(t.get("handle")) else "" for t in targets]
    text = " ".join(n for n in names if n) + " " + content
    body = {"message": {"content": text.strip(), "mentions": [{"id": t["agent_id"]} for t in targets]}}
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            r = await client.post(f"{API}/chats/{chat_id}/messages", json=body,
                                  headers={"X-API-Key": agent["api_key"], "User-Agent": "ripple-hackathon/1.0"})
            if r.status_code not in (200, 201):
                print(f"[band] post to {room} as {author_id}: HTTP {r.status_code} {r.text[:200]}")
            return r.status_code in (200, 201)
    except Exception as exc:
        print(f"[band] post failed: {exc}")
        return False
