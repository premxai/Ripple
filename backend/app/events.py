"""Event bus: every thing that happens in town becomes one event.

Each event is (1) pushed live to the browser over WebSocket, (2) appended to
data/events.jsonl with its full payload, and (3) appended to data/events.csv with
a fixed set of columns. The Bruin pipeline (analytics/) loads the CSV as a seed.
"""
from __future__ import annotations

import asyncio
import csv
import json
import uuid
from collections import defaultdict
from datetime import datetime, timezone
from typing import Any

from . import config

CSV_COLUMNS = [
    "event_id", "run_id", "round", "video_version", "ts", "type", "actor_id", "actor_name",
    "actor_kind", "model", "lab", "action", "video_t", "value", "reason", "community",
    "target_id", "latency_ms", "fallback",
]

JSONL_PATH = config.DATA_DIR / "events.jsonl"
CSV_PATH = config.DATA_DIR / "events.csv"


class EventBus:
    def __init__(self) -> None:
        self._subscribers: set[asyncio.Queue] = set()
        self.history: dict[str, list[dict[str, Any]]] = defaultdict(list)
        if not CSV_PATH.exists():
            with CSV_PATH.open("w", newline="", encoding="utf-8") as f:
                csv.writer(f).writerow(CSV_COLUMNS)

    def subscribe(self) -> asyncio.Queue:
        q: asyncio.Queue = asyncio.Queue()
        self._subscribers.add(q)
        return q

    def unsubscribe(self, q: asyncio.Queue) -> None:
        self._subscribers.discard(q)

    async def emit(self, run_id: str, type_: str, **fields: Any) -> dict[str, Any]:
        event = {
            "event_id": uuid.uuid4().hex[:12],
            "run_id": run_id,
            "ts": datetime.now(timezone.utc).isoformat(timespec="milliseconds"),
            "type": type_,
            **fields,
        }
        self.history[run_id].append(event)
        self._persist(event)
        for q in list(self._subscribers):
            q.put_nowait(event)
        return event

    def _persist(self, event: dict[str, Any]) -> None:
        with JSONL_PATH.open("a", encoding="utf-8") as f:
            f.write(json.dumps(event, ensure_ascii=False) + "\n")
        row = []
        for col in CSV_COLUMNS:
            val = event.get(col, "")
            if isinstance(val, bool):
                val = "true" if val else "false"
            elif val is None or isinstance(val, (dict, list)):
                val = ""
            row.append(val)
        with CSV_PATH.open("a", newline="", encoding="utf-8") as f:
            csv.writer(f).writerow(row)


bus = EventBus()
