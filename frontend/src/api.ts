import type { Health, RippleEvent, Town, VideoInfo } from "./types";

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, init);
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  return res.json() as Promise<T>;
}

const json = (body: unknown): RequestInit => ({
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

export const api = {
  health: () => req<Health>("/api/health"),
  town: () => req<Town>("/api/town"),
  upload: (file: File) => {
    const form = new FormData();
    form.append("file", file);
    return req<VideoInfo>("/api/videos", { method: "POST", body: form });
  },
  sample: () => req<VideoInfo>("/api/videos/sample", { method: "POST" }),
  run: (video_id: string, caption: string, prev_run_id?: string) =>
    req<{ run_id: string; round: number }>("/api/runs", json({ video_id, caption, prev_run_id })),
  answer: (run_id: string, panelist_id: string, question: string, answer: string) =>
    req<{ reply: string; answer_score: number; follow_up: string }>(
      `/api/runs/${run_id}/answer`,
      json({ panelist_id, question, answer }),
    ),
  ttsUrl: (panelist: string, text: string) =>
    `/api/tts?panelist=${encodeURIComponent(panelist)}&text=${encodeURIComponent(text)}`,
};

export function connectEvents(onEvent: (e: RippleEvent) => void): () => void {
  let socket: WebSocket | null = null;
  let closed = false;
  const open = () => {
    const proto = location.protocol === "https:" ? "wss" : "ws";
    socket = new WebSocket(`${proto}://${location.host}/ws`);
    socket.onmessage = (msg) => onEvent(JSON.parse(msg.data));
    socket.onclose = () => {
      if (!closed) setTimeout(open, 1500);
    };
  };
  open();
  return () => {
    closed = true;
    socket?.close();
  };
}

export function playVoice(panelist: string, text: string) {
  const audio = new Audio(api.ttsUrl(panelist, text));
  audio.play().catch(() => undefined);
  return audio;
}

export const fmtTime = (s: number) => {
  const sec = Math.max(0, Math.round(s));
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`;
};
