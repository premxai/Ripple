import { lazy, Suspense, useEffect } from "react";
import { Box, Map as MapIcon } from "lucide-react";
import { useStore } from "../store";
import TownMap from "./TownMap";
import MapInspector from "./MapInspector";

const Town3D = lazy(() => import("./Town3D"));

const LEGEND = [
  { color: "#0EA5A4", label: "Watching" },
  { color: "#22A06B", label: "Liked / shared" },
  { color: "#E5484D", label: "Scrolled away" },
];

export default function TownView() {
  const town = useStore((s) => s.town);
  const view = useStore((s) => s.view);
  const setView = useStore((s) => s.setView);

  // Open on the live 3D town when the browser can run WebGL 2; the illustrated map stays one click away.
  useEffect(() => {
    try {
      if (document.createElement("canvas").getContext("webgl2")) setView("3d");
    } catch {
      /* keep the map */
    }
  }, [setView]);

  return (
    <section className="relative h-full min-h-[420px] overflow-hidden rounded-[1.4rem] bg-white" aria-label="Town">
      {!town ? (
        <div className="grid h-full place-items-center text-muted">Loading town…</div>
      ) : view === "map" ? (
        <TownMap />
      ) : (
        <Suspense fallback={<div className="grid h-full place-items-center text-muted">Loading 3D…</div>}>
          <Town3D />
        </Suspense>
      )}

      <div className="absolute left-3 top-3 z-[4000] flex rounded-xl border border-line bg-white p-1 shadow-sm" role="tablist" aria-label="Town view">
        {([
          ["map", "Map", MapIcon],
          ["3d", "3D", Box],
        ] as const).map(([id, label, Icon]) => (
          <button
            key={id}
            role="tab"
            aria-selected={view === id}
            onClick={() => setView(id)}
            className={`flex cursor-pointer items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
              view === id ? "bg-ink text-white" : "text-muted hover:text-ink"
            }`}
          >
            <Icon size={14} /> {label}
          </button>
        ))}
      </div>

      <div className="pointer-events-none absolute bottom-3 right-3 z-[4000] hidden items-center gap-3 rounded-xl border border-line bg-white/95 px-3 py-2 text-[11px] text-muted shadow-sm sm:flex">
        {LEGEND.map((l) => (
          <span key={l.label} className="flex items-center gap-1.5">
            <span className="h-2.5 w-4 rounded-[50%] border-2" style={{ borderColor: l.color }} /> {l.label}
          </span>
        ))}
      </div>

      <MapInspector />
    </section>
  );
}
