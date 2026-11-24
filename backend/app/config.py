"""Settings for Ripple.

Secrets are read in this order: ripple/.env, then the Windows user environment
(read fresh from the registry, so a key set with `setx` works without a restart),
then the process environment.
"""
from __future__ import annotations

import os
import sys
from pathlib import Path

from dotenv import dotenv_values

ROOT = Path(__file__).resolve().parents[2]  # .../ripple
DATA_DIR = ROOT / "data"
VIDEO_DIR = DATA_DIR / "videos"
FRAME_DIR = DATA_DIR / "frames"
TTS_DIR = DATA_DIR / "tts"
for _d in (DATA_DIR, VIDEO_DIR, FRAME_DIR, TTS_DIR):
    _d.mkdir(parents=True, exist_ok=True)

_DOTENV = {k: v for k, v in dotenv_values(ROOT / ".env").items() if v}


def _windows_user_env(name: str) -> str | None:
    if sys.platform != "win32":
        return None
    try:
        import winreg

        with winreg.OpenKey(winreg.HKEY_CURRENT_USER, "Environment") as key:
            value = winreg.QueryValueEx(key, name)[0]
            return str(value) if value else None
    except OSError:
        return None


def env(name: str, default: str = "") -> str:
    return _DOTENV.get(name) or _windows_user_env(name) or os.environ.get(name) or default


# --- Model access -----------------------------------------------------------
NEON_BASE_URL = env("NEON_AI_GATEWAY_BASE_URL").rstrip("/")
NEON_TOKEN = env("NEON_AI_GATEWAY_TOKEN")
OPENAI_API_KEY = env("OPENAI_API_KEY")  # audio only: whisper-1 transcripts + TTS voices

# Mock mode runs the whole town with rule-based decisions: free, instant, offline.
MOCK = env("RIPPLE_MOCK", "0") == "1" or not (NEON_BASE_URL and NEON_TOKEN)

CALL_TIMEOUT = float(env("RIPPLE_CALL_TIMEOUT", "12"))
FALLBACK_MODEL = env("RIPPLE_FALLBACK_MODEL", "claude-haiku-5-5")
CAPTION_MODEL = env("RIPPLE_CAPTION_MODEL", "gpt-5-4-mini")
TTS_MODEL = env("RIPPLE_TTS_MODEL", "gpt-4o-mini-tts")

# --- Sponsor tools ----------------------------------------------------------
TELEM_API_KEY = env("TELEM_API_KEY")
BAND_CONFIG = Path(env("RIPPLE_BAND_CONFIG", str(ROOT / "band_agents.json")))
# Command that refreshes the Bruin pipeline, e.g.
#   wsl -d Ubuntu -- bash -lc "cd /mnt/c/path/to/ripple && bruin run analytics"
BRUIN_CMD = env("RIPPLE_BRUIN_CMD")
DUCKDB_PATH = Path(env("RIPPLE_DUCKDB_PATH", str(DATA_DIR / "town.duckdb")))

FRONTEND_ORIGINS = ["http://localhost:5173", "http://127.0.0.1:5173"]
