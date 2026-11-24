"""The town simulation.

One round = one post of one video version:
  1. residents walk to where they hang out,
  2. at each checkpoint (hook / middle / end) everyone still watching decides, in
     parallel, on their own model: keep watching, scroll, like, comment or share,
  3. shares ripple into community rooms (BAND) and friends who scrolled past get a
     second chance,
  4. metrics: drop-off curve, hook hold, completion, shares and the Ripple Score.
"""
from __future__ import annotations

import asyncio
import math
import random
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from . import config, llm
from .events import bus
from .integrations import band
from .personas import COMMUNITIES, RESIDENT_BY_ID, RESIDENTS, Resident

ACTIONS = ("keep_watching", "scroll", "like", "comment", "share")
FEELINGS = ("❤️", "🔥", "😂", "😴", "🤔", "😬", "👀", "🤯")
DEFAULT_FEELING = {"keep_watching": "👀", "scroll": "😴", "like": "❤️", "comment": "🤔", "share": "🔥"}


@dataclass
class RoundResult:
    run_id: str
    round: int
    video_version: str
    duration: float
    exits: dict[str, float] = field(default_factory=dict)  # resident -> second they scrolled away
    reasons: dict[str, str] = field(default_factory=dict)  # resident -> latest reason
    decisions: list[dict[str, Any]] = field(default_factory=list)
    likes: set[str] = field(default_factory=set)
    comments: list[dict[str, Any]] = field(default_factory=list)
    shares: list[dict[str, Any]] = field(default_factory=list)
    rewatched: set[str] = field(default_factory=set)
    metrics: dict[str, Any] = field(default_factory=dict)
    memory: dict[str, str] = field(default_factory=dict)


SYSTEM = """You are {name}, {age}, {tag}. {bio}
Interests: {interests}. You are scrolling a short-video feed on your phone.
Patience for slow intros: about {patience:.0f}s. Skepticism: {skep}/10.
Stay fully in character. Real people scroll away fast; keep watching only if this actually grabs YOU.
Reply ONLY with one JSON object, no other text."""

DECIDE = """Post caption: "{caption}"
You are at the {label} of the video ({start:.0f}s to {end:.0f}s of {duration:.0f}s).
On screen: {visual}
Said in this part: "{transcript}"
{history}{memory}
Decide what you do during this part.
JSON: {{"action": "keep_watching|scroll|like|comment|share", "at_second": <number from {start:.1f} to {end:.1f}>, "reason": "<max 14 words, first person, specific>", "feeling": "<one of {feelings}>", "comment": "<short comment if you comment, else empty>", "share_to": "<one of {communities} if you share, else empty>"}}"""

SECOND_CHANCE = """Your friend {friend} just shared this video in "{community}" and said: "{why}".
Earlier you scrolled past it at {t:.0f}s because: "{yours}".
Post caption: "{caption}"
Do you go back and watch it now?
JSON: {{"action": "rewatch|ignore", "reason": "<max 14 words, first person>", "feeling": "<one of {feelings}>"}}"""


def _system(r: Resident) -> str:
    return SYSTEM.format(name=r.name, age=r.age, tag=r.tag, bio=r.bio, interests=", ".join(r.interests),
                         patience=r.patience_s, skep=round(r.skepticism * 10))


def _clamp(v: Any, lo: float, hi: float) -> float:
    try:
        return max(lo, min(hi, float(v)))
    except (TypeError, ValueError):
        return hi


# --- Decisions ----------------------------------------------------------------

async def _decide(r: Resident, cp: dict[str, Any], frame: bytes, caption: str, duration: float,
                  history: list[str], memory: str | None, version: str, rng: random.Random) -> dict[str, Any]:
    if config.MOCK:
        return await _mock_decide(r, cp, version, rng)
    hist = ("What you did so far: " + " ".join(history) + "\n") if history else ""
    mem = (f"Memory: {memory} Judge this version on its own merits, but notice what changed.\n") if memory else ""
    text = DECIDE.format(caption=caption, label=cp["label"], start=cp["start"], end=cp["end"], duration=duration,
                         visual=cp.get("caption") or "see image", transcript=cp.get("transcript") or "(no speech)",
                         history=hist, memory=mem, feelings=" ".join(FEELINGS),
                         communities="|".join(r.communities))
    content: str | list[dict[str, Any]] = text
    if r.vision and frame:
        content = [{"type": "text", "text": text}, llm.image_part(frame)]
    return await llm.ask_json(r.model, _system(r), content)


MOCK_REASONS = {
    "scroll": ["Intro is too slow, lost me.", "Feels like every other launch ad.", "Not for me, swiping.",
               "Logo intro again? Next.", "No idea what it does yet."],
    "keep_watching": ["Okay, curious where this goes.", "Clean visuals, I'll give it a sec.",
                      "Founder seems real, still watching."],
    "like": ["Actually useful, liked it.", "Nice edit, good energy."],
    "comment": ["Wait, does it work offline?", "What does it cost though?"],
    "share": ["My group chat needs this.", "Sending this to my team."],
}


async def _mock_decide(r: Resident, cp: dict[str, Any], version: str, rng: random.Random) -> dict[str, Any]:
    base = {"hook": 0.18 + max(0.0, 2.5 - r.patience_s) * 0.12 + r.skepticism * 0.15,
            "middle": 0.12 + r.skepticism * 0.2, "end": 0.08}.get(cp["label"], 0.1)
    if version != "v1":
        base *= 0.45  # a re-edited version: pretend the fixes worked
    # Same roll for the same resident + checkpoint in every round, so v2 reliably beats v1 in mock demos.
    roll = random.Random(f"{r.id}:{cp['label']}").random()
    if roll < base:
        action = "scroll"
    elif roll < base + 0.12:
        action = "like"
    elif roll < base + 0.2 and cp["label"] != "hook":
        action = "share"
    elif roll < base + 0.26:
        action = "comment"
    else:
        action = "keep_watching"
    await asyncio.sleep(rng.uniform(0.3, 1.4))
    return {"data": {"action": action, "at_second": rng.uniform(cp["start"], cp["end"]),
                     "reason": rng.choice(MOCK_REASONS[action]), "feeling": DEFAULT_FEELING[action],
                     "comment": MOCK_REASONS["comment"][0] if action == "comment" else "",
                     "share_to": r.communities[0] if action == "share" else ""},
            "model": r.model, "latency_ms": rng.randint(300, 1400), "fallback": False, "mock": True}


# --- Round --------------------------------------------------------------------

async def run_round(run_id: str, round_no: int, version: str, analysis: dict[str, Any], caption: str,
                    memory: dict[str, str] | None = None) -> RoundResult:
    memory = memory or {}
    rng = random.Random(run_id)
    duration = float(analysis.get("duration") or 15.0)
    cps = analysis["checkpoints"]
    res = RoundResult(run_id, round_no, version, duration)
    common = {"round": round_no, "video_version": version}

    await bus.emit(run_id, "round_start", **common, actor_kind="system", value=duration, reason=caption,
                   mock=config.MOCK)
    for r in RESIDENTS:
        await bus.emit(run_id, "move", **common, actor_id=r.id, actor_name=r.name, actor_kind="resident",
                       target_id=r.hangout)
    await asyncio.sleep(1.5)  # let the walk animate in the UI

    frames = {i: (Path(cp["frame_path"]).read_bytes() if cp.get("frame_path") and Path(cp["frame_path"]).exists()
                  else b"") for i, cp in enumerate(cps)}
    history: dict[str, list[str]] = {r.id: [] for r in RESIDENTS}
    watching = list(RESIDENTS)

    for i, cp in enumerate(cps):
        if not watching:
            break
        for r in watching:
            await bus.emit(run_id, "thinking", **common, actor_id=r.id, actor_name=r.name, actor_kind="resident",
                           reason=cp["label"])
        outs = await asyncio.gather(*(
            _decide(r, cp, frames[i], caption, duration, history[r.id], memory.get(r.id), version, rng)
            for r in watching), return_exceptions=True)
        still: list[Resident] = []
        for r, out in zip(watching, outs):
            if isinstance(out, Exception):
                print(f"[sim] {r.name} ({r.model}) failed: {out}")
                out = await _mock_decide(r, cp, version, rng)
                out["error"] = True
            d = out["data"]
            action = str(d.get("action", "keep_watching")).strip().lower()
            if action not in ACTIONS:
                action = "keep_watching"
            at = round(_clamp(d.get("at_second"), cp["start"], cp["end"]), 2)
            reason = str(d.get("reason", "")).strip()[:160]
            feeling = d.get("feeling") if d.get("feeling") in FEELINGS else DEFAULT_FEELING[action]
            share_to = str(d.get("share_to") or "").strip()
            if action == "share" and share_to not in r.communities:
                share_to = r.communities[0]
            ev = await bus.emit(run_id, "decision", **common, actor_id=r.id, actor_name=r.name,
                                actor_kind="resident", model=out["model"], lab=r.lab, action=action, video_t=at,
                                reason=reason, community=share_to if action == "share" else "",
                                latency_ms=out.get("latency_ms", 0), fallback=out.get("fallback", False),
                                feeling=feeling, checkpoint=cp["label"], comment=str(d.get("comment") or "")[:160],
                                mock=bool(out.get("mock")))
            res.decisions.append(ev)
            res.reasons[r.id] = reason
            history[r.id].append(f"At the {cp['label']} you chose {action} ({reason}).")
            if action == "scroll":
                res.exits[r.id] = at
                continue
            still.append(r)
            if action == "like":
                res.likes.add(r.id)
            elif action == "comment":
                res.comments.append({"from": r.id, "text": ev["comment"] or reason, "t": at})
            elif action == "share":
                res.shares.append({"from": r.id, "community": share_to, "t": at, "reason": reason})
        watching = still
        await asyncio.sleep(0.4)

    await _word_of_mouth(res, caption, rng)
    res.metrics = compute_metrics(res)
    await bus.emit(run_id, "metrics", **common, actor_kind="system", value=res.metrics["score"],
                   metrics=res.metrics)
    for r in RESIDENTS:
        if r.id in res.exits:
            res.memory[r.id] = (f"You saw an earlier version and scrolled away at {res.exits[r.id]:.0f}s because: "
                                f"{res.reasons.get(r.id, '')}")
        else:
            res.memory[r.id] = f"You saw an earlier version and watched to the end. Last thought: {res.reasons.get(r.id, '')}"
    await bus.emit(run_id, "round_done", **common, actor_kind="system", value=res.metrics["score"])
    return res


async def _word_of_mouth(res: RoundResult, caption: str, rng: random.Random) -> None:
    common = {"round": res.round, "video_version": res.video_version}
    asked: set[str] = set()
    for share in res.shares:
        sharer = RESIDENT_BY_ID[share["from"]]
        community = next(c for c in COMMUNITIES if c.id == share["community"])
        recipients = [m for m in community.members if m != sharer.id and m in res.exits and m not in asked]
        asked.update(recipients)
        await bus.emit(res.run_id, "ripple", **common, actor_id=sharer.id, actor_name=sharer.name,
                       actor_kind="resident", community=community.id, value=len(community.members) - 1,
                       video_t=share["t"], reason=share["reason"], target_id=",".join(recipients))
        others = [m for m in community.members if m != sharer.id]
        if band.enabled():
            posted = await band.post(sharer.id, community.id, f'Shared: "{caption}". {share["reason"]}',
                                     recipients or others)
            await bus.emit(res.run_id, "band_post", **common, actor_id=sharer.id, actor_name=sharer.name,
                           actor_kind="resident", community=community.id, action="ok" if posted else "failed",
                           target_id=",".join(recipients or others))

        async def second_chance(rid: str) -> None:
            r = RESIDENT_BY_ID[rid]
            if config.MOCK:
                await asyncio.sleep(rng.uniform(0.3, 1.0))
                out = {"data": {"action": "rewatch" if rng.random() < 0.45 else "ignore",
                                "reason": "Okay, if my friend says so." if rng.random() < 0.5 else "Still not my thing.",
                                "feeling": "👀"}, "model": r.model, "latency_ms": 500, "fallback": False}
            else:
                prompt = SECOND_CHANCE.format(friend=sharer.name, community=community.name, why=share["reason"],
                                              t=res.exits[rid], yours=res.reasons.get(rid, ""), caption=caption,
                                              feelings=" ".join(FEELINGS))
                try:
                    out = await llm.ask_json(r.model, _system(r), prompt)
                except Exception as exc:
                    print(f"[sim] second chance {r.name} failed: {exc}")
                    return
            d = out["data"]
            action = "rewatch" if str(d.get("action", "")).lower().startswith("rewatch") else "ignore"
            if action == "rewatch":
                res.rewatched.add(rid)
            await bus.emit(res.run_id, "second_chance", **common, actor_id=rid, actor_name=r.name,
                           actor_kind="resident", model=out["model"], lab=r.lab, action=action,
                           reason=str(d.get("reason", ""))[:160], community=community.id, target_id=sharer.id,
                           latency_ms=out.get("latency_ms", 0), fallback=out.get("fallback", False),
                           feeling=d.get("feeling") if d.get("feeling") in FEELINGS else "👀")

        await asyncio.gather(*(second_chance(rid) for rid in recipients))


def compute_metrics(res: RoundResult) -> dict[str, Any]:
    n = len(RESIDENTS)
    d = res.duration
    end = d + 1
    curve = []
    for t in range(0, int(math.ceil(d)) + 1):
        still = sum(1 for r in RESIDENTS if res.exits.get(r.id, end) > t)
        curve.append({"t": t, "pct": round(100 * still / n, 1)})
    hook_hold = sum(1 for r in RESIDENTS if res.exits.get(r.id, end) > min(3.0, d)) / n
    completed = sum(1 for r in RESIDENTS if r.id not in res.exits) / n
    sharers = len({s["from"] for s in res.shares}) / n
    engaged = len(res.likes | {c["from"] for c in res.comments} | {s["from"] for s in res.shares}) / n
    reached = len(res.rewatched) / n
    score = round(100 * (0.35 * hook_hold + 0.30 * completed + 0.20 * min(1.0, (sharers + reached) * 2)
                         + 0.15 * engaged))
    drop_t, drop = 0, 0.0
    for a, b in zip(curve, curve[1:]):
        if a["pct"] - b["pct"] > drop:
            drop_t, drop = b["t"], a["pct"] - b["pct"]
    exits = sorted(((rid, t) for rid, t in res.exits.items()), key=lambda x: x[1])
    return {
        "score": score,
        "residents": n,
        "duration": d,
        "curve": curve,
        "hook_hold_pct": round(100 * hook_hold),
        "scrolled_pct": round(100 * len(res.exits) / n),
        "watched_pct": round(100 * completed),
        "shared_pct": round(100 * sharers),
        "engaged_pct": round(100 * engaged),
        "rewatched_via_share": len(res.rewatched),
        "biggest_drop": {"t": drop_t, "pct": round(drop, 1)},
        "exits": [{"resident": RESIDENT_BY_ID[rid].name, "t": t, "reason": res.reasons.get(rid, "")}
                  for rid, t in exits],
        "comments": [{"resident": RESIDENT_BY_ID[c["from"]].name, "text": c["text"]} for c in res.comments],
        "shares": [{"resident": RESIDENT_BY_ID[s["from"]].name, "community": s["community"],
                    "reason": s["reason"]} for s in res.shares],
    }
