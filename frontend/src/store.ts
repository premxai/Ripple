import { create } from "zustand";
import type { Health, Metrics, Phase, Report, Review, RippleEvent, Town, VideoInfo } from "./types";

export interface ResidentView {
  location: string;
  thinking: boolean;
  status: "idle" | "watching" | "scrolled" | "engaged";
  bubble?: { emoji: string; at: number };
}

export interface RunInfo {
  run_id: string;
  round: number;
  video: VideoInfo;
  caption: string;
}

interface State {
  health?: Health;
  town?: Town;
  video?: VideoInfo; // video currently loaded in the phone
  caption: string;
  phase: Phase;
  runs: RunInfo[];
  activeRunId?: string;
  log: RippleEvent[];
  notes: RippleEvent[];
  replies: RippleEvent[];
  metricsByRound: Record<number, Metrics>;
  review?: Review;
  report?: Report;
  panelStatus: string;
  residents: Record<string, ResidentView>;
  ripples: { id: string; residentId: string; at: number }[];
  panelOpen: boolean;
  error?: string;
  view: "map" | "3d";
  labels: boolean;
  selection?: { kind: "resident" | "place"; id: string; focus?: number };
  setView: (view: "map" | "3d") => void;
  setLabels: (labels: boolean) => void;
  select: (selection?: { kind: "resident" | "place"; id: string; focus?: boolean }) => void;
  setTown: (town: Town, health: Health) => void;
  setVideo: (video: VideoInfo | undefined) => void;
  setCaption: (caption: string) => void;
  setPhase: (phase: Phase) => void;
  addRun: (run: RunInfo) => void;
  setPanelOpen: (open: boolean) => void;
  setError: (error?: string) => void;
  handleEvent: (e: RippleEvent) => void;
}

const LOG_TYPES = new Set(["decision", "second_chance", "ripple"]);

export const useStore = create<State>((set, get) => ({
  caption: "",
  phase: "idle",
  runs: [],
  log: [],
  notes: [],
  replies: [],
  metricsByRound: {},
  panelStatus: "Waiting for a video",
  residents: {},
  ripples: [],
  panelOpen: false,
  view: "map",
  labels: true,
  setView: (view) => set({ view }),
  setLabels: (labels) => set({ labels }),
  // `focus` is a timestamp so selecting the same resident again re-centers the map.
  select: (sel) => set({ selection: sel ? { kind: sel.kind, id: sel.id, focus: sel.focus ? Date.now() : undefined } : undefined }),

  setTown: (town, health) =>
    set({
      town,
      health,
      residents: Object.fromEntries(
        town.residents.map((r) => [r.id, { location: r.home, thinking: false, status: "idle" as const }]),
      ),
    }),
  setVideo: (video) => set({ video }),
  setCaption: (caption) => set({ caption }),
  setPhase: (phase) => set({ phase }),
  addRun: (run) => set((s) => ({ runs: [...s.runs, run], activeRunId: run.run_id })),
  setPanelOpen: (panelOpen) => set({ panelOpen }),
  setError: (error) => set({ error }),

  handleEvent: (e) => {
    const s = get();
    if (s.activeRunId && e.run_id !== s.activeRunId && !s.runs.some((r) => r.run_id === e.run_id)) return;
    const now = performance.now();
    const patchResident = (id: string | undefined, patch: Partial<ResidentView>) => {
      if (!id || !s.residents[id]) return {};
      return { residents: { ...get().residents, [id]: { ...get().residents[id], ...patch } } };
    };

    switch (e.type) {
      case "round_start":
        set({
          phase: "simulating",
          panelStatus: "Watching along with the town",
          residents: Object.fromEntries(
            Object.entries(s.residents).map(([id, r]) => [id, { ...r, status: "idle", thinking: false, bubble: undefined }]),
          ),
        });
        break;
      case "move":
        set(patchResident(e.actor_id, { location: e.target_id ?? "park" }));
        break;
      case "thinking":
        set(patchResident(e.actor_id, { thinking: true }));
        break;
      case "decision": {
        const status = e.action === "scroll" ? "scrolled" : e.action === "keep_watching" ? "watching" : "engaged";
        set({
          ...patchResident(e.actor_id, { thinking: false, status, bubble: { emoji: e.feeling ?? "👀", at: now } }),
          log: [e, ...get().log].slice(0, 200),
        });
        break;
      }
      case "second_chance":
        set({
          ...patchResident(e.actor_id, {
            bubble: { emoji: e.action === "rewatch" ? "👀" : "🙅", at: now },
            status: e.action === "rewatch" ? "engaged" : get().residents[e.actor_id ?? ""]?.status ?? "scrolled",
          }),
          log: [e, ...get().log].slice(0, 200),
        });
        break;
      case "ripple":
        set({
          ripples: [...get().ripples, { id: e.event_id, residentId: e.actor_id ?? "", at: now }].slice(-12),
          ...patchResident(e.actor_id, { bubble: { emoji: "📣", at: now } }),
          log: LOG_TYPES.has(e.type) ? [e, ...get().log].slice(0, 200) : get().log,
        });
        break;
      case "metrics":
        if (e.metrics && e.round) set({ metricsByRound: { ...s.metricsByRound, [e.round]: e.metrics } });
        break;
      case "round_done":
        set({ panelStatus: "Reviewing the results" });
        break;
      case "panel_phase":
        set({
          phase: "review",
          panelStatus: e.action === "back_room" ? "Talking privately in the back room" : "Writing the verdict",
          // The whole town walks to the square to hear the verdict.
          residents:
            e.action === "back_room"
              ? Object.fromEntries(
                  Object.entries(get().residents).map(([id, r]) => [id, { ...r, location: "town_square", thinking: false }]),
                )
              : get().residents,
        });
        break;
      case "panel_note":
        set({ notes: [...s.notes, e] });
        break;
      case "panel_review":
        set({ review: e.review, panelStatus: "Verdict ready", phase: "review" });
        break;
      case "panel_reply":
        set({ replies: [...s.replies, e] });
        break;
      case "report":
        set({ report: e.report, phase: "done", panelStatus: "Report card ready" });
        break;
      case "error":
        set({ error: e.reason, panelStatus: "Something went wrong" });
        break;
    }
  },
}));
