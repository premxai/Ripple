"""Make two test launch videos for a made-up app ("Pocketchef") so Ripple can be tested end to end:
  v1: weak  - 3.5s logo slate, generic corporate pitch, flat voice
  v2: strong - hook in the first second, clear benefit, captions, energetic voice
plus a landscape copy of v2 to test the wide video layout.

Slides come from Runware, voiceovers from OpenAI TTS, assembly from ffmpeg.
Run from ripple/backend:  uv run python ../scripts/make_test_videos.py
Output: ripple/demo/test-videos/{v1,v2,v2-landscape}.mp4
"""
from __future__ import annotations

import asyncio
import json
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

from openai import AsyncOpenAI  # noqa: E402

from app import config  # noqa: E402
from app.integrations import runware  # noqa: E402

OUT = ROOT / "demo" / "test-videos"
FFMPEG = shutil.which("ffmpeg") or "ffmpeg"
FFPROBE = shutil.which("ffprobe") or "ffprobe"
FONT = "C\\:/Windows/Fonts/arialbd.ttf" if sys.platform == "win32" else "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
PHOTO = "photorealistic vertical smartphone ad frame, natural light, shallow depth of field, no text, no letters, no logos, no watermark"

VIDEOS = {
    "v1": {
        "voice": "onyx",
        "style": "Flat, slow, corporate monotone narrator reading a press release. No enthusiasm.",
        "intro": 3.5,
        "vo": ("Introducing Pocketchef. The next generation, AI powered culinary intelligence platform. "
               "Leveraging advanced machine learning, Pocketchef optimizes your meal planning workflow "
               "across all of your devices. Download today."),
        "slides": [
            ("minimal dark navy corporate logo slate, a small abstract white chef hat icon in the center, "
             "plain gradient background, no text", "POCKETCHEF"),
            (f"empty sterile modern kitchen, nobody in it, cold corporate stock photo, {PHOTO}", "Introducing Pocketchef"),
            (f"a smartphone lying flat on a grey kitchen counter, dull lighting, stock photo, {PHOTO}", "AI-powered culinary platform"),
            (f"a few vegetables on a white table, flat boring lighting, stock photo, {PHOTO}", "Download today"),
        ],
    },
    "v2": {
        "voice": "nova",
        "style": "Energetic, warm, fast-paced creator talking to a friend. Playful, punchy, smiling.",
        "intro": 0.0,
        "vo": ("It's 7pm, the fridge is basically empty, and you're about to order takeout. Again. "
               "Wait. Snap your fridge with Pocketchef. Eggs, spinach, cheese? Dinner in ten minutes. "
               "Twelve thousand people saved dinner this week. Try it free tonight."),
        "slides": [
            (f"tired young woman opening a nearly empty fridge at night, funny relatable expression, {PHOTO}", "7pm. Empty fridge. Again?"),
            (f"hand holding a smartphone taking a photo inside a fridge with eggs, spinach and cheese, {PHOTO}", "Snap your fridge"),
            (f"golden spinach and cheese omelette on a plate with steam rising, cozy kitchen, {PHOTO}", "Dinner in 10 minutes"),
            (f"happy friends eating dinner together at a small apartment table, laughing, {PHOTO}", "12,000 dinners saved this week"),
            (f"smartphone on a kitchen counter next to fresh food, colorful app screen, {PHOTO}", "Pocketchef. Try it free tonight"),
        ],
    },
}


def run(args: list[str], cwd: Path) -> None:
    p = subprocess.run(args, cwd=cwd, capture_output=True, text=True, encoding="utf-8", errors="replace")
    if p.returncode != 0:
        raise RuntimeError(f"ffmpeg failed: {p.stderr[-800:]}")


def duration(path: Path) -> float:
    p = subprocess.run([FFPROBE, "-v", "error", "-show_entries", "format=duration", "-of", "json", str(path)],
                       capture_output=True, text=True)
    return float(json.loads(p.stdout)["format"]["duration"])


async def assets(name: str, spec: dict, work: Path) -> None:
    sem = asyncio.Semaphore(4)

    async def slide(i: int, prompt: str) -> None:
        async with sem:
            (work / f"slide{i}.png").write_bytes(await runware.generate(prompt, width=576, height=1024, seed=1000 + i))

    async def voice() -> None:
        client = AsyncOpenAI(api_key=config.OPENAI_API_KEY, timeout=60, max_retries=1)
        resp = await client.audio.speech.create(model="gpt-4o-mini-tts", voice=spec["voice"], input=spec["vo"],
                                                instructions=spec["style"])
        (work / "vo.mp3").write_bytes(resp.content)

    await asyncio.gather(voice(), *(slide(i, p) for i, (p, _) in enumerate(spec["slides"])))
    print(f"{name}: slides + voiceover ready")


def assemble(name: str, spec: dict, work: Path) -> Path:
    vo = duration(work / "vo.mp3")
    n = len(spec["slides"])
    intro = spec["intro"]
    if intro:
        durs = [intro] + [(vo + 0.6) / (n - 1)] * (n - 1)
    else:
        durs = [(vo + 0.6) / n] * n
    segs = []
    for i, ((_, caption), d) in enumerate(zip(spec["slides"], durs)):
        (work / f"cap{i}.txt").write_text(caption, encoding="utf-8")
        big = intro and i == 0
        text = (f"drawtext=fontfile='{FONT}':textfile='cap{i}.txt':fontcolor=white:"
                + ("fontsize=92:x=(w-text_w)/2:y=(h-text_h)/2" if big else
                   "fontsize=54:box=1:boxcolor=black@0.5:boxborderw=22:x=(w-text_w)/2:y=h*0.70"))
        vf = (f"scale=792:1408,crop=720:1280:x='(iw-ow)*t/{d:.2f}':y='(ih-oh)/2',{text},format=yuv420p")
        seg = f"seg{i}.mp4"
        run([FFMPEG, "-y", "-v", "error", "-loop", "1", "-t", f"{d:.2f}", "-i", f"slide{i}.png", "-vf", vf,
             "-r", "30", "-c:v", "libx264", "-preset", "veryfast", seg], work)
        segs.append(seg)
    (work / "list.txt").write_text("".join(f"file '{s}'\n" for s in segs), encoding="utf-8")
    out = OUT / f"{name}.mp4"
    delay = int(intro * 1000)
    run([FFMPEG, "-y", "-v", "error", "-f", "concat", "-safe", "0", "-i", "list.txt", "-i", "vo.mp3",
         "-filter_complex", f"[1:a]adelay={delay}:all=1,apad[a]", "-map", "0:v", "-map", "[a]", "-shortest",
         "-c:v", "copy", "-c:a", "aac", str(out)], work)
    print(f"{name}: {out.name} ({duration(out):.1f}s)")
    return out


def landscape(src: Path) -> Path:
    out = OUT / "v2-landscape.mp4"
    run([FFMPEG, "-y", "-v", "error", "-i", str(src), "-filter_complex",
         "[0:v]scale=1280:720:force_original_aspect_ratio=increase,crop=1280:720,boxblur=20:5[bg];"
         "[0:v]scale=-2:720[fg];[bg][fg]overlay=(W-w)/2:0,format=yuv420p",
         "-c:v", "libx264", "-preset", "veryfast", "-c:a", "copy", str(out)], OUT)
    print(f"landscape: {out.name} ({duration(out):.1f}s)")
    return out


async def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    works = {k: OUT / f"_work_{k}" for k in VIDEOS}
    for w in works.values():
        w.mkdir(exist_ok=True)
    await asyncio.gather(*(assets(k, VIDEOS[k], works[k]) for k in VIDEOS))
    paths = {k: assemble(k, VIDEOS[k], works[k]) for k in VIDEOS}
    landscape(paths["v2"])


if __name__ == "__main__":
    asyncio.run(main())
