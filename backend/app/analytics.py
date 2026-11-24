"""Bridge to the Bruin pipeline in ripple/analytics/.

The backend appends every event to data/events.csv. Running the Bruin pipeline loads
that CSV as a seed into DuckDB (data/town.duckdb) and builds the marts
(retention curve, funnel, objections, share graph, opinions by model, v1 vs v2).
The panel reads those marts as extra evidence when they exist.
"""
from __future__ import annotations

import asyncio
import subprocess
from typing import Any

from . import config

TABLES = {
    "ripple.decisions", "ripple.retention_curve", "ripple.funnel", "ripple.objections",
    "ripple.share_graph", "ripple.opinions_by_model", "ripple.version_compare",
}


async def refresh() -> dict[str, Any]:
    if not config.BRUIN_CMD:
        return {"ran": False, "reason": "Set RIPPLE_BRUIN_CMD to run the Bruin pipeline."}

    def _run() -> subprocess.CompletedProcess:
        # Bruin prints UTF-8 box-drawing characters; decode explicitly or Windows drops the output.
        return subprocess.run(config.BRUIN_CMD, shell=True, cwd=config.ROOT, capture_output=True, text=True,
                              encoding="utf-8", errors="replace", timeout=180)

    try:
        proc = await asyncio.to_thread(_run)
    except subprocess.TimeoutExpired:
        return {"ran": True, "ok": False, "tail": "bruin run timed out"}
    except Exception as exc:
        return {"ran": True, "ok": False, "tail": f"bruin run failed to start: {exc}"}
    out = (proc.stdout or "") + (proc.stderr or "")
    return {"ran": True, "ok": proc.returncode == 0, "tail": out[-1500:]}


def read(table: str, run_id: str | None = None) -> list[dict[str, Any]]:
    if table not in TABLES:
        raise ValueError(f"unknown table {table}")
    import duckdb

    con = duckdb.connect(str(config.DUCKDB_PATH), read_only=True)
    try:
        cols = [r[0] for r in con.execute(f"DESCRIBE {table}").fetchall()]
        if run_id and "run_id" in cols:
            cur = con.execute(f"SELECT * FROM {table} WHERE run_id = ?", [run_id])
        else:
            cur = con.execute(f"SELECT * FROM {table}")
        names = [d[0] for d in cur.description]
        return [dict(zip(names, row)) for row in cur.fetchall()]
    finally:
        con.close()


def safe_read(table: str, run_id: str | None = None) -> list[dict[str, Any]]:
    if not config.DUCKDB_PATH.exists():
        return []
    try:
        return read(table, run_id)
    except Exception:
        return []
