import { useState } from "react";
import { BarChart3, Clapperboard, Flame, Sparkles } from "lucide-react";
import { useStore } from "../store";

const ICONS: Record<string, typeof Clapperboard> = {
  creative_director: Clapperboard,
  algorithm: BarChart3,
  trend_scout: Flame,
};
const TINTS: Record<string, string> = {
  creative_director: "#E3F4F3",
  algorithm: "#ECEAE6",
  trend_scout: "#FEF4E2",
};

/** Runware portrait from /avatars/<id>.png, falling back to an icon if it's missing. */
export function PanelIcon({ id, size = 64 }: { id: string; size?: number }) {
  const Icon = ICONS[id] ?? Sparkles;
  const [failed, setFailed] = useState(false);
  return (
    <span
      className="relative grid shrink-0 place-items-center overflow-hidden rounded-full"
      style={{ width: size, height: size, background: TINTS[id] ?? "#E3F4F3", boxShadow: "0 0 0 3px #fff, 0 0 0 4px #EBE5DA" }}
    >
      {failed ? (
        <Icon size={size * 0.42} className="text-ink" strokeWidth={1.8} />
      ) : (
        <img src={`/avatars/${id}.png`} alt="" className="h-full w-full object-cover" onError={() => setFailed(true)} />
      )}
    </span>
  );
}

export default function PanelCard() {
  const town = useStore((s) => s.town);
  const status = useStore((s) => s.panelStatus);
  const review = useStore((s) => s.review);
  const notes = useStore((s) => s.notes);
  const setPanelOpen = useStore((s) => s.setPanelOpen);
  const busy = status.startsWith("Talking") || status.startsWith("Writing") || status.startsWith("Reviewing");

  return (
    <section className="card p-4" aria-label="Expert panel">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-[15px] font-semibold">Panel</h2>
        <span className="flex items-center gap-1.5 text-[11px] text-muted">
          {busy && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-teal" />}
          {status}
        </span>
      </div>
      <div className="grid grid-cols-3 gap-2 text-center">
        {(town?.panel ?? []).map((p) => (
          <div key={p.id} className="flex flex-col items-center gap-1.5">
            <PanelIcon id={p.id} />
            <span className="text-[13px] font-medium leading-tight">{p.name}</span>
            <span className="max-w-full truncate font-mono text-[10px] text-faint" title={`${p.lab} · ${p.model}`}>{p.model}</span>
          </div>
        ))}
      </div>
      <button
        onClick={() => setPanelOpen(true)}
        disabled={!review && notes.length === 0}
        className="mt-4 flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-teal py-2.5 text-sm font-semibold text-white transition hover:bg-teal-dark disabled:cursor-not-allowed disabled:opacity-40"
      >
        {review ? "Answer the panel" : "Ask the panel a question"} <Sparkles size={15} />
      </button>
    </section>
  );
}
