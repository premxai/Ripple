"""One-time BAND setup for Ripple, using your BAND *user* API key (band_u_...).

  uv run python -m app.integrations.band_setup register   # create one agent per resident
  uv run python -m app.integrations.band_setup rooms      # create the 5 community rooms with members
  uv run python -m app.integrations.band_setup check      # verify every agent key (posts nothing)

The user key is read from the BAND_USER_API_KEY environment variable only and is never
written to disk. Agent IDs, agent keys, handles and room IDs go to ripple/band_agents.json
(gitignored). Every step is idempotent: entries that already exist are skipped.

Endpoints (docs.band.ai, checked 2026-11-23):
  POST /api/v1/me/agents/register   {"agent": {"name", "description"}}         (user key)
  POST /api/v1/me/chats             {"chat": {"title", "participants": [...]}}  (user key)
  GET  /api/v1/agent/me                                                         (agent key)
"""
from __future__ import annotations

import json
import os
import sys
from typing import Any

import httpx

from .. import config
from ..personas import COMMUNITIES, RESIDENTS

BASE = config.env("RIPPLE_BAND_BASE", "https://app.band.ai").rstrip("/")
UA = "ripple-hackathon/1.0"


def _load() -> dict[str, Any]:
    try:
        return json.loads(config.BAND_CONFIG.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {"agents": {}, "rooms": {}}


def _save(cfg: dict[str, Any]) -> None:
    tmp = config.BAND_CONFIG.with_suffix(".tmp")
    tmp.write_text(json.dumps(cfg, indent=2), encoding="utf-8")
    os.replace(tmp, config.BAND_CONFIG)


def _filled(v: Any) -> bool:
    return bool(v) and not str(v).startswith("PASTE")


def _pick(d: Any, *paths: tuple[str, ...]) -> Any:
    for path in paths:
        cur = d
        for k in path:
            cur = cur.get(k) if isinstance(cur, dict) else None
        if cur:
            return cur
    return None


def _user_headers() -> dict[str, str]:
    key = os.environ.get("BAND_USER_API_KEY", "")
    if not key.startswith("band_u_"):
        sys.exit("Set BAND_USER_API_KEY (starts with band_u_) for this command.")
    return {"X-API-Key": key, "User-Agent": UA, "Content-Type": "application/json"}


def register() -> None:
    cfg = _load()
    agents = cfg.setdefault("agents", {})
    headers = _user_headers()
    with httpx.Client(timeout=30) as c:
        for r in RESIDENTS:
            cur = agents.get(r.id, {})
            if _filled(cur.get("agent_id")) and _filled(cur.get("api_key")):
                print(f"skip {r.id}: already registered")
                continue
            body = {"agent": {"name": f"{r.name} (Ripple)",
                              "description": f"{r.name}, {r.age}, {r.tag} in Ripple's AI town. {r.bio}"}}
            resp = c.post(f"{BASE}/api/v1/me/agents/register", json=body, headers=headers)
            if resp.status_code in (401, 403):
                sys.exit(f"stop: BAND rejected the user key (HTTP {resp.status_code}). Nothing else was attempted.")
            if resp.status_code not in (200, 201):
                code = (resp.json().get("error") or {}).get("code", "") if resp.headers.get("content-type", "").startswith("application/json") else ""
                print(f"FAIL {r.id}: HTTP {resp.status_code} {code}")
                continue
            d = resp.json()
            agent_id = _pick(d, ("data", "agent", "id"), ("agent", "id"), ("data", "id"), ("agent_id",), ("id",))
            api_key = _pick(d, ("data", "credentials", "api_key"), ("credentials", "api_key"), ("data", "api_key"), ("api_key",))
            handle = _pick(d, ("data", "agent", "handle"), ("agent", "handle"), ("data", "handle")) or ""
            if not (agent_id and api_key):
                print(f"FAIL {r.id}: response had no id/key")
                continue
            agents[r.id] = {"agent_id": agent_id, "api_key": api_key, "handle": handle or "PASTE_HANDLE"}
            _save(cfg)  # save after each one so a failure never loses a created agent
            print(f"ok   {r.id}: registered{' as @' + handle if handle else ''}")


def rooms() -> None:
    cfg = _load()
    agents = cfg.get("agents", {})
    room_ids = cfg.setdefault("rooms", {})
    headers = _user_headers()
    with httpx.Client(timeout=30) as c:
        for com in COMMUNITIES:
            if _filled(room_ids.get(com.id)):
                print(f"skip {com.id}: room exists")
                continue
            members = [agents[m]["agent_id"] for m in com.members if _filled(agents.get(m, {}).get("agent_id"))]
            if not members:
                print(f"FAIL {com.id}: no registered members yet")
                continue
            body = {"chat": {"title": f"{com.name} (Ripple)",
                             "participants": [{"participant_id": a} for a in members]}}
            resp = c.post(f"{BASE}/api/v1/me/chats", json=body, headers=headers)
            if resp.status_code in (401, 403):
                sys.exit(f"stop: BAND refused room creation (HTTP {resp.status_code}).")
            if resp.status_code not in (200, 201):
                print(f"FAIL {com.id}: HTTP {resp.status_code} {resp.text[:200]}")
                continue
            room_ids[com.id] = _pick(resp.json(), ("data", "id"), ("id",))
            _save(cfg)
            print(f"ok   {com.id}: '{com.name} (Ripple)' with {len(members)} agents + you")


def check() -> None:
    cfg = _load()
    agents = cfg.get("agents", {})
    changed = False
    with httpx.Client(timeout=20) as c:
        for pid, a in agents.items():
            if not _filled(a.get("api_key")):
                print(f"skip {pid}: no key")
                continue
            resp = c.get(f"{BASE}/api/v1/agent/me", headers={"X-API-Key": a["api_key"], "User-Agent": UA})
            if resp.status_code != 200:
                print(f"FAIL {pid}: HTTP {resp.status_code}")
                continue
            d = resp.json()
            handle = _pick(d, ("data", "handle"), ("handle",), ("data", "agent", "handle"))
            if handle and handle != a.get("handle"):
                a["handle"] = handle
                changed = True
            print(f"ok   {pid}: @{a.get('handle')}")
    if changed:
        _save(cfg)
    print("rooms:", {k: ("set" if _filled(v) else "missing") for k, v in cfg.get("rooms", {}).items()})


if __name__ == "__main__":
    {"register": register, "rooms": rooms, "check": check}.get(
        sys.argv[1] if len(sys.argv) > 1 else "", lambda: sys.exit(__doc__))()
