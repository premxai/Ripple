"""Telem: real web search + page fetch, used by the Trend Scout and for competitor pages.

API shapes from https://docs.telem.ai/api/ (checked 2026-11-23). Every call shows up
in the Telem console as a session, so the panel's evidence has a paper trail.
Results are cached in memory to save the free credit.
"""
from __future__ import annotations

from typing import Any

import httpx

from .. import config

BASE = "https://router.telem.ai/v1"
_cache: dict[str, Any] = {}


def enabled() -> bool:
    return bool(config.TELEM_API_KEY)


def _headers() -> dict[str, str]:
    return {"Authorization": f"Bearer {config.TELEM_API_KEY}", "Content-Type": "application/json"}


async def search(query: str, num_results: int = 5, published_after: str | None = None) -> list[dict[str, str]]:
    """Returns [{title, url, summary}]. Empty list if Telem isn't configured or fails."""
    if not enabled():
        return []
    key = f"s:{query}:{num_results}:{published_after}"
    if key in _cache:
        return _cache[key]
    body: dict[str, Any] = {"user_input": {"query": query},
                            "search": {"num_results": num_results, "tier": "default"}}
    if published_after:
        body["search"]["published_after"] = published_after
    try:
        async with httpx.AsyncClient(timeout=20) as client:
            r = await client.post(f"{BASE}/search", json=body, headers=_headers())
            r.raise_for_status()
            data = r.json()
    except Exception as exc:
        print(f"[telem] search failed: {exc}")
        return []
    results: list[dict[str, str]] = []
    for run in data.get("preprocessor_runs", []):
        for item in (run.get("output_payload") or {}).get("results", []):
            results.append({"title": item.get("title", ""), "url": item.get("url", ""),
                            "summary": item.get("summary", "")})
    _cache[key] = results[:num_results]
    return _cache[key]


async def fetch(urls: list[str], max_chars: int = 6000) -> list[dict[str, str]]:
    """Returns [{url, title, content}] for up to 5 URLs."""
    if not enabled() or not urls:
        return []
    body = {"urls": urls[:5], "options": {"content_format": "markdown", "inline_max_chars": max_chars}}
    try:
        async with httpx.AsyncClient(timeout=30) as client:
            r = await client.post(f"{BASE}/fetch", json=body, headers=_headers())
            r.raise_for_status()
            data = r.json()
    except Exception as exc:
        print(f"[telem] fetch failed: {exc}")
        return []
    pages: list[dict[str, str]] = []
    for run in data.get("preprocessor_runs", []):
        for item in (run.get("output_payload") or {}).get("fetched_results", []):
            if item.get("status") == "succeeded":
                pages.append({"url": item.get("url", ""), "title": item.get("title", ""),
                              "content": item.get("content", "")})
    return pages
