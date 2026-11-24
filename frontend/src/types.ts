export interface Resident {
  id: string;
  name: string;
  age: number;
  tag: string;
  bio: string;
  communities: string[];
  home: string;
  hangout: string;
  model: string;
  lab: string;
  vision: boolean;
  color: string;
}

export interface Panelist {
  id: string;
  name: string;
  role: string;
  lens: string;
  model: string;
  lab: string;
  color: string;
}

export interface Location {
  id: string;
  name: string;
  x: number;
  z: number;
  community: string;
  blurb: string;
}

export interface Community {
  id: string;
  name: string;
  kind: string;
  members: string[];
}

export interface Town {
  residents: Resident[];
  panel: Panelist[];
  locations: Location[];
  communities: Community[];
}

export interface Health {
  ok: boolean;
  mock: boolean;
  residents: number;
  labs: number;
  telem: boolean;
  band: boolean;
  bruin: boolean;
  voices: boolean;
}

export interface Checkpoint {
  label: string;
  start: number;
  end: number;
  caption?: string;
  transcript?: string;
}

export interface VideoInfo {
  video_id: string;
  url: string;
  duration: number;
  width?: number;
  height?: number;
  checkpoints: Checkpoint[];
}

export interface Metrics {
  score: number;
  residents: number;
  duration: number;
  curve: { t: number; pct: number }[];
  hook_hold_pct: number;
  scrolled_pct: number;
  watched_pct: number;
  shared_pct: number;
  engaged_pct: number;
  rewatched_via_share: number;
  biggest_drop: { t: number; pct: number };
}

export interface Fix {
  title: string;
  evidence: string;
  owner: string;
}

export interface Review {
  verdict: string;
  questions: string[];
  fixes: Fix[];
  predicted_score_after_fixes?: number;
  trends?: { title: string; url: string; summary: string }[];
}

export interface Report {
  headline: string;
  what_changed: string;
  next_step: string;
  v1: Metrics;
  v2: Metrics;
  delta: Record<string, number>;
}

export interface RippleEvent {
  event_id: string;
  run_id: string;
  ts: string;
  type: string;
  round?: number;
  video_version?: string;
  actor_id?: string;
  actor_name?: string;
  actor_kind?: string;
  model?: string;
  lab?: string;
  action?: string;
  video_t?: number;
  value?: number;
  reason?: string;
  community?: string;
  target_id?: string;
  latency_ms?: number;
  fallback?: boolean;
  feeling?: string;
  checkpoint?: string;
  comment?: string;
  question?: string;
  answer?: string;
  follow_up?: string;
  mock?: boolean;
  metrics?: Metrics;
  review?: Review;
  report?: Report;
}

export type Phase = "idle" | "analyzing" | "ready" | "simulating" | "review" | "done";
