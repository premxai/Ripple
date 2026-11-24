import { ListFilter } from "lucide-react";
import { useState } from "react";
import { fmtTime } from "../api";
import { useStore } from "../store";
import type { RippleEvent } from "../types";
import Avatar from "./Avatar";

function actionLine(e: RippleEvent, communityName: (id?: string) => string, nameOf: (id?: string) => string) {
  const t = fmtTime(e.video_t ?? 0);
  if (e.type === "ripple") return `Shared to ${communityName(e.community)}`;
  if (e.type === "second_chance")
    return e.action === "rewatch" ? `Came back via ${nameOf(e.target_id)}'s share` : `Ignored ${nameOf(e.target_id)}'s share`;
  switch (e.action) {
    case "scroll":
      return `Scrolled at ${t}`;
    case "like":
      return `Liked at ${t}`;
    case "comment":
      return `Commented at ${t}`;
    case "share":
      return `Shared at ${t}`;
    default:
      return `Kept watching (${e.checkpoint ?? "hook"})`;
  }
}

const ACTION_COLOR: Record<string, string> = {
  scroll: "text-red",
  like: "text-teal-dark",
  share: "text-teal-dark",
  comment: "text-[#9a6408]",
  rewatch: "text-teal-dark",
};

export default function DecisionLog() {
  const log = useStore((s) => s.log);
  const town = useStore((s) => s.town);
  const select = useStore((s) => s.select);
  const [all, setAll] = useState(false);
  const [onlyExits, setOnlyExits] = useState(false);
  const byId = Object.fromEntries((town?.residents ?? []).map((r) => [r.id, r]));
  const communityName = (id?: string) => town?.communities.find((c) => c.id === id)?.name ?? "a group chat";
  const nameOf = (id?: string) => byId[id ?? ""]?.name ?? "a friend";
  const rows = log.filter((e) => !onlyExits || e.action === "scroll").slice(0, all ? 200 : 6);

  return (
    <section className="card flex min-h-0 flex-col p-4" aria-label="Decision log">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-[15px] font-semibold">Decision log</h2>
        <button
          onClick={() => setOnlyExits((v) => !v)}
          className={`cursor-pointer rounded-lg p-1.5 ${onlyExits ? "bg-teal-soft text-teal-dark" : "text-muted hover:bg-paper"}`}
          aria-label="Show only scroll-aways"
          title="Show only scroll-aways"
        >
          <ListFilter size={16} />
        </button>
      </div>
      {rows.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted">Every resident's choice and reason shows up here.</p>
      ) : (
        <ul className={`divide-y divide-line ${all ? "max-h-[420px] overflow-y-auto pr-1" : ""}`}>
          {rows.map((e) => {
            const r = byId[e.actor_id ?? ""];
            if (!r) return null;
            return (
              <li
                key={e.event_id}
                className="animate-fade-in -mx-2 flex cursor-pointer gap-3 rounded-xl px-2 py-2.5 hover:bg-paper"
                onClick={() => select({ kind: "resident", id: r.id, focus: true })}
                title={`Show ${r.name} on the map`}
              >
                <Avatar id={r.id} name={r.name} color={r.color} size={38} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm font-semibold">{r.name}</span>
                    <span className="truncate rounded-md bg-teal-soft px-1.5 py-0.5 text-[10px] font-medium text-teal-dark">{r.tag}</span>
                    <span className="ml-auto shrink-0 font-mono text-[10px] text-faint" title={`${e.lab} · ${e.latency_ms ?? 0}ms${e.fallback ? " · fallback" : ""}`}>
                      {e.model}
                    </span>
                  </div>
                  <p className={`text-[13px] font-medium ${ACTION_COLOR[e.action ?? ""] ?? "text-ink"}`}>
                    {actionLine(e, communityName, nameOf)}
                  </p>
                  {e.reason && (
                    <p className="truncate font-mono text-[11px] text-muted" title={e.reason}>
                      reason: "{e.reason}"
                    </p>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {log.length > 6 && (
        <button
          onClick={() => setAll((v) => !v)}
          className="mt-2 w-full cursor-pointer rounded-xl border border-line py-2 text-xs font-medium hover:bg-paper"
        >
          {all ? "Show less" : `View full decision log (${log.length})`}
        </button>
      )}
    </section>
  );
}
