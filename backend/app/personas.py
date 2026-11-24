"""The town: 10 residents (each on a different lab's model) and the 3-person expert panel.

Edit freely. Every model ID below was tested on the Neon AI Gateway on 2026-11-23.
`vision=False` models get a text description of each key frame instead of the image.
"""
from __future__ import annotations

from dataclasses import asdict, dataclass, field


@dataclass
class Resident:
    id: str
    name: str
    age: int
    tag: str  # short persona label shown in the UI
    bio: str
    interests: list[str]
    patience_s: float  # how long a slow intro can run before they bail
    skepticism: float  # 0 = believes anything, 1 = hard to convince
    communities: list[str]
    home: str  # location id
    hangout: str  # where they watch videos
    model: str
    lab: str
    vision: bool = True
    color: str = "#0EA5A4"


@dataclass
class Panelist:
    id: str
    name: str
    role: str
    lens: str  # what they judge
    model: str
    lab: str
    voice: str  # gpt-4o-mini-tts voice
    voice_style: str
    color: str = "#0EA5A4"


@dataclass
class Location:
    id: str
    name: str
    x: float  # position in the 3D view
    z: float
    community: str = ""  # BAND room that lives in this district, if any
    blurb: str = ""


@dataclass
class Community:
    id: str
    name: str
    kind: str
    members: list[str] = field(default_factory=list)


LOCATIONS = [
    Location("town_square", "Town Square", 1.5, 3.0, "", "The fountain park. The town gathers here for the panel's verdict."),
    Location("waterfront", "Waterfront", 8.0, -1.0, "", "Boardwalk and pier. Where trend-hoppers film their content."),
    Location("startup_row", "Startup Row", 2.5, -6.5, "founders", "Glass towers full of founders. Home of the Founders Slack."),
    Location("creator_loft", "Creator Loft", -0.5, -6.5, "creators", "Brick warehouse studios. Home of the Creator Discord."),
    Location("gym", "Gym & Field", 7.0, 6.5, "gym", "Running track and weights. Home of the Gym chat."),
    Location("suburbs", "Family Suburb", -6.5, 3.0, "parents", "Houses and a playground. Home of the Parents group."),
    Location("campus", "Campus", -2.0, 7.0, "campus", "Clock tower and quad. Home of the Campus group chat."),
    Location("cafe", "Cafe Street", 5.5, -4.5, "", "Striped awnings and oat lattes."),
    Location("food_market", "Food Market", 6.5, 3.5, "", "Food trucks and picnic tables."),
    Location("apartments", "Apartments", -6.0, -5.5, "", "Cozy downtown apartments."),
]

RESIDENTS = [
    Resident("maya", "Maya", 21, "Student", "Design major who lives on TikTok and judges every hook in a second.",
             ["design", "fashion", "study hacks"], 2.0, 0.5, ["campus", "creators"], "apartments", "cafe",
             "claude-haiku-5-5", "Anthropic", color="#0EA5A4"),
    Resident("ethan", "Ethan", 29, "SaaS Founder", "Runs a 6-person B2B startup; watches launch videos to steal ideas.",
             ["startups", "growth", "productivity tools"], 6.0, 0.6, ["founders"], "apartments", "startup_row",
             "gpt-5-4-mini", "OpenAI", color="#3B82F6"),
    Resident("zoe", "Zoe", 24, "Trend-Hopper", "Knows every sound that is trending this week and gets bored fast.",
             ["memes", "music", "pop culture"], 1.5, 0.3, ["creators", "campus"], "apartments", "waterfront",
             "grok-4-7", "xAI", vision=False, color="#EC4899"),
    Resident("noah", "Noah", 19, "Student", "Computer science freshman, broke, loves free tools and gaming.",
             ["gaming", "coding", "free stuff"], 4.0, 0.4, ["campus", "gym"], "campus", "campus",
             "llama-4-maverick", "Meta", color="#F59E0B"),
    Resident("lily", "Lily", 34, "Busy Parent", "Two kids, a full-time job, and about nine seconds of attention.",
             ["family", "time-savers", "deals"], 3.0, 0.5, ["parents"], "suburbs", "suburbs",
             "gemini-3-8-flash", "Google", color="#8B5CF6"),
    Resident("raj", "Raj", 41, "Engineer / Skeptic", "Staff engineer who has seen a hundred 'revolutionary' launches.",
             ["infrastructure", "privacy", "benchmarks"], 8.0, 0.9, ["founders"], "suburbs", "startup_row",
             "gpt-5-4-nano", "OpenAI", color="#64748B"),
    Resident("ava", "Ava", 27, "Creator", "Full-time creator with 80k followers; shares what makes her look smart.",
             ["content", "editing", "brand deals"], 3.0, 0.4, ["creators"], "apartments", "creator_loft",
             "kimi-k3", "Moonshot", color="#F97316"),
    Resident("marcus", "Marcus", 31, "Sales Lead", "Gym at 6am, sales calls all day, loves anything that saves him time.",
             ["fitness", "sales", "cars"], 3.0, 0.5, ["gym", "founders"], "apartments", "gym",
             "glm-5-3-flash", "Zhipu", color="#10B981"),
    Resident("grace", "Grace", 63, "Retiree", "Retired teacher; patient, curious, shares good finds with her family chat.",
             ["gardening", "family", "learning"], 10.0, 0.6, ["parents"], "suburbs", "town_square",
             "gemma-3-12b", "Google (open)", color="#A16207"),
    Resident("leo", "Leo", 36, "Product Manager", "PM at a big tech company; evaluates positioning and who it's for.",
             ["product", "UX", "strategy"], 5.0, 0.7, ["founders", "parents"], "suburbs", "food_market",
             "qwen3-next-80b-a3b-instruct", "Alibaba", vision=False, color="#EF4444"),
]

PANEL = [
    Panelist("creative_director", "Creative Director", "Creative Director",
             "the hook, pacing, story and visuals", "claude-sonnet-5-5", "Anthropic",
             "sage", "Warm, sharp creative director giving notes in a studio review.", color="#0EA5A4"),
    Panelist("algorithm", "The Algorithm", "The Algorithm",
             "watch-through, drop-off, shares and predicted reach", "gpt-5-5", "OpenAI",
             "onyx", "Calm, precise, slightly robotic platform algorithm reading out numbers.", color="#1F1D1A"),
    Panelist("trend_scout", "Trend Scout", "Trend Scout",
             "what is trending now and how the video fits the moment", "grok-4-7", "xAI",
             "verse", "Fast-talking, upbeat trend scout who lives on social media.", color="#F5A524"),
]

COMMUNITIES = [
    Community("campus", "Campus group chat", "group chat"),
    Community("creators", "Creator Discord", "discord"),
    Community("founders", "Founders Slack", "slack"),
    Community("parents", "Parents group", "group chat"),
    Community("gym", "Gym chat", "group chat"),
]
for _c in COMMUNITIES:
    _c.members = [r.id for r in RESIDENTS if _c.id in r.communities]

RESIDENT_BY_ID = {r.id: r for r in RESIDENTS}
PANEL_BY_ID = {p.id: p for p in PANEL}


def town_payload() -> dict:
    return {
        "residents": [asdict(r) for r in RESIDENTS],
        "panel": [asdict(p) for p in PANEL],
        "locations": [asdict(loc) for loc in LOCATIONS],
        "communities": [asdict(c) for c in COMMUNITIES],
    }
