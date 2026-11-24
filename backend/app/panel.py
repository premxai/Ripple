"""The expert panel: Creative Director, The Algorithm and Trend Scout (Track 3 coaching).

1. Back room: each panelist writes a private note to the others about the creator.
2. Verdict: the lead turns the notes into questions and 3 evidence-backed fixes.
3. Q&A: the creator answers; the panelist adapts and scores the answer.
4. Report: after v2, compare both rounds.
"""
from __future__ import annotations

import asyncio
import json
from typing import Any

from . import analytics, config, llm
from .events import bus
from .integrations import telem
from .personas import PANEL, PANEL_BY_ID, RESIDENT_BY_ID
from .sim import RoundResult

SYSTEM = """You are {name} on Ripple's expert panel, coaching a creator before they post a launch video.
Your lens: {lens}.
Be specific and evidence-based: cite the numbers, timestamps and resident quotes you are given.
Kind but direct, like a great mentor. Reply ONLY with one JSON object, no other text."""


def _system(pid: str) -> str:
    p = PANEL_BY_ID[pid]
    return SYSTEM.format(name=p.name, lens=p.lens)


def evidence(analysis: dict[str, Any], caption: str, res: RoundResult, trends: list[dict[str, str]],
             bruin_rows: list[dict[str, Any]]) -> str:
    m = res.metrics
    lines = [f'Caption: "{caption}"', f"Video length: {res.duration:.0f}s, version {res.video_version}."]
    for cp in analysis["checkpoints"]:
        lines.append(f"- {cp['label']} ({cp['start']:.0f}-{cp['end']:.0f}s): on screen: {cp.get('caption', '')}; "
                     f"said: \"{cp.get('transcript') or '(no speech)'}\"")
    lines.append(f"Ripple Score {m['score']}/100. Hook hold {m['hook_hold_pct']}%, scrolled {m['scrolled_pct']}%, "
                 f"watched to end {m['watched_pct']}%, shared {m['shared_pct']}%, "
                 f"biggest drop at {m['biggest_drop']['t']}s ({m['biggest_drop']['pct']} pts), "
                 f"{m['rewatched_via_share']} came back via a friend's share.")
    lines.append("Resident decisions:")
    for ev in res.decisions[-30:]:
        r = RESIDENT_BY_ID.get(ev.get("actor_id", ""))
        if r:
            lines.append(f"- {r.name} ({r.tag}) {ev['action']} at {ev['video_t']}s: \"{ev['reason']}\"")
    if trends:
        lines.append("Live trend search (Telem):")
        lines += [f"- {t['title']}: {t['summary'][:200]} ({t['url']})" for t in trends]
    if bruin_rows:
        lines.append("Bruin analytics (opinions by model):")
        lines += [f"- {json.dumps(row, default=str)}" for row in bruin_rows[:12]]
    return "\n".join(lines)


async def _ask(pid: str, prompt: str) -> dict[str, Any]:
    return await llm.ask_json(PANEL_BY_ID[pid].model, _system(pid), prompt, max_tokens=3000,
                              timeout=max(config.CALL_TIMEOUT, 25))


async def review(run_id: str, analysis: dict[str, Any], caption: str, res: RoundResult) -> dict[str, Any]:
    common = {"round": res.round, "video_version": res.video_version}
    trends: list[dict[str, str]] = []
    if telem.enabled():
        query = f"short-form launch video trends this week {caption[:80]}"
        trends = await telem.search(query, num_results=4)
        await bus.emit(run_id, "telem_search", **common, actor_id="trend_scout", actor_name="Trend Scout",
                       actor_kind="panel", reason=query, value=len(trends), results=trends)
    bruin_rows = analytics.safe_read("ripple.opinions_by_model", run_id)
    ev_text = evidence(analysis, caption, res, trends, bruin_rows)
    await bus.emit(run_id, "panel_phase", **common, actor_kind="system", action="back_room")

    async def note(pid: str) -> dict[str, Any]:
        if config.MOCK:
            await asyncio.sleep(0.8)
            m = res.metrics
            data = {"creative_director": {"note": f"Hook loses {100 - m['hook_hold_pct']}% by 0:03. Push on the first frame.",
                                          "question": "What should someone feel in the first 2 seconds?", "focus": "hook"},
                    "algorithm": {"note": f"Completion {m['watched_pct']}%, shares {m['shared_pct']}%. Distribution stalls.",
                                  "question": "Who exactly is this video for?", "focus": "audience"},
                    "trend_scout": {"note": "Format feels dated; on-screen captions and a faster cut are standard now.",
                                    "question": "Why would someone send this to a friend?", "focus": "trend"}}[pid]
            out = {"data": data, "model": PANEL_BY_ID[pid].model, "latency_ms": 800, "fallback": False}
        else:
            out = await _ask(pid, f"{ev_text}\n\nWrite a PRIVATE back-room note to the other two panelists about "
                                  'this creator. JSON {"note": "<max 35 words: what you noticed and what to push '
                                  'on>", "question": "<one question you want to ask the creator>", '
                                  '"focus": "hook|pacing|audience|message|trend|format"}')
        d = out["data"]
        await bus.emit(run_id, "panel_note", **common, actor_id=pid, actor_name=PANEL_BY_ID[pid].name,
                       actor_kind="panel", model=out["model"], lab=PANEL_BY_ID[pid].lab,
                       action=str(d.get("focus", "")), reason=str(d.get("note", ""))[:300],
                       question=str(d.get("question", "")), latency_ms=out.get("latency_ms", 0),
                       fallback=out.get("fallback", False))
        return {"panelist": pid, **d}

    notes = await asyncio.gather(*(note(p.id) for p in PANEL))
    await bus.emit(run_id, "panel_phase", **common, actor_kind="system", action="verdict")

    if config.MOCK:
        m = res.metrics
        verdict = {
            "verdict": f"Strong product, weak opening: {m['scrolled_pct']}% of the town scrolled before the payoff.",
            "questions": [n["question"] for n in notes],
            "fixes": [
                {"title": "Open on the result, not the logo", "owner": "creative_director",
                 "evidence": f"Biggest drop at {m['biggest_drop']['t']}s ({m['biggest_drop']['pct']} pts)."},
                {"title": "Name the audience in line one", "owner": "algorithm",
                 "evidence": f"Only {m['watched_pct']}% watched to the end."},
                {"title": "Add captions and a faster cut", "owner": "trend_scout",
                 "evidence": "3 residents said it felt like every other launch ad."},
            ],
            "predicted_score_after_fixes": min(95, m["score"] + 25),
        }
        lead_model = PANEL_BY_ID["creative_director"].model
    else:
        notes_text = "\n".join(f"- {PANEL_BY_ID[n['panelist']].name}: {n.get('note', '')} "
                               f"(wants to ask: {n.get('question', '')})" for n in notes)
        out = await _ask("creative_director",
                         f"{ev_text}\n\nBack-room notes from the panel:\n{notes_text}\n\n"
                         "Write the panel's verdict for the creator. JSON {\"verdict\": \"<1 sentence>\", "
                         "\"questions\": [\"<the 3 best questions to ask the creator>\"], \"fixes\": "
                         "[{\"title\": \"<max 8 words>\", \"evidence\": \"<cite a number, timestamp or resident>\", "
                         "\"owner\": \"creative_director|algorithm|trend_scout\"}], "
                         "\"predicted_score_after_fixes\": <0-100>} with exactly 3 fixes.")
        verdict = out["data"]
        lead_model = out["model"]
    verdict["notes"] = notes
    verdict["trends"] = trends
    await bus.emit(run_id, "panel_review", **common, actor_id="creative_director", actor_name="Creative Director",
                   actor_kind="panel", model=lead_model, reason=str(verdict.get("verdict", ""))[:300],
                   value=verdict.get("predicted_score_after_fixes"), review=verdict)
    return verdict


async def answer(run_id: str, round_no: int, version: str, ev_text: str, panelist_id: str, question: str,
                 answer_text: str) -> dict[str, Any]:
    pid = panelist_id if panelist_id in PANEL_BY_ID else "creative_director"
    if config.MOCK:
        await asyncio.sleep(0.8)
        score = 7 if len(answer_text) > 40 else 4
        data = {"reply": "Good, that's clearer. Now say that in the first two seconds of the video." if score > 5
                else "That's vague. Who is the one person this is for?", "answer_score": score,
                "follow_up": "" if score > 5 else "Describe your viewer in one sentence."}
        out = {"data": data, "model": PANEL_BY_ID[pid].model, "latency_ms": 800, "fallback": False}
    else:
        out = await _ask(pid, f"{ev_text}\n\nYou asked the creator: \"{question}\"\nThey answered: \"{answer_text}\"\n"
                              "Respond in character and adapt to their answer. JSON {\"reply\": \"<max 40 words>\", "
                              "\"answer_score\": <0-10>, \"follow_up\": \"<a sharper follow-up question, or empty "
                              "if satisfied>\"}")
    d = out["data"]
    await bus.emit(run_id, "panel_reply", round=round_no, video_version=version, actor_id=pid,
                   actor_name=PANEL_BY_ID[pid].name, actor_kind="panel", model=out["model"],
                   lab=PANEL_BY_ID[pid].lab, reason=str(d.get("reply", ""))[:300], value=d.get("answer_score"),
                   question=question, answer=answer_text, follow_up=str(d.get("follow_up", "")))
    return d


async def final_report(run_id: str, r1: RoundResult, r2: RoundResult) -> dict[str, Any]:
    m1, m2 = r1.metrics, r2.metrics
    delta = {k: m2[k] - m1[k] for k in ("score", "hook_hold_pct", "scrolled_pct", "watched_pct", "shared_pct")}
    if config.MOCK:
        data = {"headline": f"Ripple Score {m1['score']} -> {m2['score']}",
                "what_changed": f"Hook hold went from {m1['hook_hold_pct']}% to {m2['hook_hold_pct']}%.",
                "next_step": "Post it, then test a 15-second cut for Reels."}
        model = PANEL_BY_ID["creative_director"].model
    else:
        out = await _ask("creative_director",
                         f"Version 1 metrics: {json.dumps({k: v for k, v in m1.items() if k != 'curve'})}\n"
                         f"Version 2 metrics: {json.dumps({k: v for k, v in m2.items() if k != 'curve'})}\n"
                         "Write the final report card. JSON {\"headline\": \"<max 10 words>\", "
                         "\"what_changed\": \"<1-2 sentences citing numbers>\", \"next_step\": \"<1 sentence>\"}")
        data, model = out["data"], out["model"]
    report = {**data, "v1": {k: v for k, v in m1.items()}, "v2": {k: v for k, v in m2.items()}, "delta": delta}
    await bus.emit(run_id, "report", round=r2.round, video_version=r2.video_version, actor_kind="panel",
                   actor_id="creative_director", actor_name="Creative Director", model=model,
                   value=m2["score"] - m1["score"], reason=str(data.get("headline", "")), report=report)
    return report
