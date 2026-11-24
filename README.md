# 🌊 Ripple

**Test your launch video on a town of AI people before you post it.**

A creator uploads a launch video. Ten AI residents, each running on a model from a different AI lab, watch it checkpoint by checkpoint, scroll away, like, comment and share it into their group chats, where friends get a second chance to watch. A three-person expert panel (Creative Director, The Algorithm, Trend Scout) discusses the creator privately, asks them questions, adapts to their answers and gives three evidence-backed fixes. The creator edits in AdaL, posts v2, and the report card shows the lift.

Built at the Multiplayer AI Hackathon (Track 3: Grow with Agents).

## How it meets the hackathon rules

| Rule | Ripple |
|---|---|
| 3+ agents with their own goals | 10 residents with personas, patience and communities + 3 panelists |
| Visual identity per character | Colors, avatars, panel icons, a 3D body in the town |
| Movement and on-screen action | Residents walk to where they hang out, react with emoji, shares ripple out |
| Visible decision log | Every decision with its reason, model and timestamp; the panel's back-room notes |
| Agents coordinate about the human | Panel back room → verdict → questions → adaptive replies with a score |
| Clear result + evidence-based feedback | Ripple Score v1 → v2, drop-off curve, fixes that cite numbers and residents |

## Sponsor tools

- **Bruin**: `analytics/` turns every town event into marts (retention curve, funnel, objections, share graph, opinions by model, v1 vs v2) with data quality checks. The panel reads them as evidence.
- **BAND**: each community (campus chat, creator Discord, founders Slack, parents group, gym chat) is a BAND room. Shares are real messages that @-mention the friends who scrolled past. See `backend/app/integrations/band.py`.
- **Telem**: the Trend Scout searches what's trending this week; results and links show in the panel review. See `backend/app/integrations/telem.py`.
- **AdaL**: edit v1 into v2 from the panel's fixes; make the demo video.
- **Runware**: generate resident/panel portraits into `frontend/public/avatars/<id>.png` (the UI picks them up automatically) and thumbnail variants.

## Models (Neon AI Gateway)

| Agent | Model | Lab |
|---|---|---|
| Maya, Student | claude-haiku-5-5 | Anthropic |
| Ethan, SaaS Founder | gpt-5-4-mini | OpenAI |
| Zoe, Trend-Hopper | grok-4-7 (gets frame descriptions) | xAI |
| Noah, Student | llama-4-maverick | Meta |
| Lily, Busy Parent | gemini-3-8-flash | Google |
| Raj, Engineer / Skeptic | gpt-5-4-nano | OpenAI |
| Ava, Creator | kimi-k3 | Moonshot |
| Marcus, Sales Lead | glm-5-3-flash | Zhipu |
| Grace, Retiree | gemma-3-12b | Google (open) |
| Leo, Product Manager | qwen3-next-80b-a3b-instruct (gets frame descriptions) | Alibaba |
| Creative Director | claude-sonnet-5-5 | Anthropic |
| The Algorithm | gpt-5-5 | OpenAI |
| Trend Scout | grok-4-7 | xAI |
| Fallback for any slow/failed call | claude-haiku-5-5 | Anthropic |

Audio goes to OpenAI directly: `whisper-1` for transcripts, `gpt-4o-mini-tts` for panel voices.

Swapped on 2026-11-23 after testing: deepseek-v4-1-flash was unavailable upstream on Neon, grok-4-6 with images took ~17s, qwen35 took ~11s.

Gateway gotchas: Claude models reject `response_format` (we parse JSON from text); reasoning models need `max_tokens` ≈ 2000; every call has a timeout and falls back to claude-haiku-5-5.

## Run it

Needs Python 3.11+, [uv](https://docs.astral.sh/uv/), Node 22+, ffmpeg.

```bash
cp .env.example .env          # fill in keys (or set them as system env vars)
cd backend && uv sync && uv run uvicorn app.main:app --reload --port 8000
cd frontend && npm install && npm run dev      # http://localhost:5173
```

Test videos: `uv run python ../scripts/make_test_videos.py` (from backend/) makes a weak v1 and a strong v2 for a made-up app in `demo/test-videos/`. Last end-to-end run: 21/21 checks, 0 fallbacks, Ripple Score 17 -> 72.

No keys yet? Set `RIPPLE_MOCK=1`: residents and panel run on rules, free and instant.

Bruin (macOS/Linux/WSL):

```bash
curl -LsSf https://getbruin.com/install/cli | sh
bruin validate analytics && bruin run analytics     # from the ripple/ folder
```

## How it works

```
upload ─► ffmpeg key frames + whisper transcript + frame captions (per checkpoint: 0-3s, 3-10s, 10s+)
       ─► round: residents decide in parallel per checkpoint (own model, own persona, memory of v1)
       ─► shares ─► BAND rooms ─► friends who scrolled past get a second chance
       ─► metrics + events.csv ─► Bruin marts
       ─► panel: back-room notes ─► verdict + 3 fixes + questions ─► creator answers ─► adaptive replies
       ─► v2 round (residents remember v1) ─► report card v1 → v2
```

Code map: `backend/app/sim.py` (town), `panel.py` (coaching), `video.py` (watching), `llm.py` (gateway calls), `personas.py` (who lives in town), `events.py` (event log), `frontend/src/components/Town3D.tsx` (the 3D town).

## Team split

1. Town and agents: `personas.py`, `sim.py`, prompts
2. BAND + panel: `integrations/band.py`, `panel.py`, Telem
3. Front end: `frontend/src/components/*`, Runware avatars, Kenney models
4. Bruin + demo: `analytics/`, AdaL v2 + demo video, README, submission
