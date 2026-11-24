import { useEffect, useState } from "react";
import { Lock, Send, Volume2, X } from "lucide-react";
import { api, playVoice } from "../api";
import { useStore } from "../store";
import { PanelIcon } from "./PanelCard";

const OWNER_ORDER = ["creative_director", "algorithm", "trend_scout"];

export default function PanelDialog() {
  const open = useStore((s) => s.panelOpen);
  const setOpen = useStore((s) => s.setPanelOpen);
  const town = useStore((s) => s.town);
  const notes = useStore((s) => s.notes);
  const review = useStore((s) => s.review);
  const replies = useStore((s) => s.replies);
  const runs = useStore((s) => s.runs);
  const health = useStore((s) => s.health);
  const [drafts, setDrafts] = useState<Record<number, string>>({});
  const [sending, setSending] = useState<number | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setOpen]);

  if (!open) return null;
  const panelName = (id?: string) => town?.panel.find((p) => p.id === id)?.name ?? "Panel";
  const runId = runs[runs.length - 1]?.run_id;
  const roundNotes = notes.filter((n) => n.run_id === runId);

  async function send(i: number, question: string) {
    const text = drafts[i]?.trim();
    if (!text || !runId) return;
    setSending(i);
    try {
      await api.answer(runId, OWNER_ORDER[i % 3], question, text);
    } finally {
      setSending(null);
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-ink/30 p-4 backdrop-blur-[2px]" onClick={() => setOpen(false)}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Panel review"
        className="card animate-fade-in max-h-[88vh] w-full max-w-[760px] overflow-y-auto p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold">Panel review</h2>
            {review && <p className="mt-1 text-[15px] text-muted">{review.verdict}</p>}
          </div>
          <button onClick={() => setOpen(false)} className="cursor-pointer rounded-lg p-1.5 hover:bg-paper" aria-label="Close">
            <X size={18} />
          </button>
        </div>

        {roundNotes.length > 0 && (
          <div className="mb-5 rounded-2xl border border-dashed border-line bg-paper p-4">
            <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted">
              <Lock size={12} /> Back room (what they said to each other)
            </p>
            <ul className="space-y-2">
              {roundNotes.map((n) => (
                <li key={n.event_id} className="flex gap-3 text-sm">
                  <PanelIcon id={n.actor_id ?? ""} size={30} />
                  <div>
                    <span className="font-medium">{n.actor_name}</span>
                    <span className="ml-2 font-mono text-[10px] text-faint">{n.model}</span>
                    <p className="text-muted">{n.reason}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}

        {review && (
          <>
            <h3 className="mb-2 text-sm font-semibold">Fixes, with evidence</h3>
            <ol className="mb-5 space-y-2">
              {review.fixes?.map((f, i) => (
                <li key={i} className="flex gap-3 rounded-xl border border-line p-3">
                  <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-teal text-xs font-semibold text-white">{i + 1}</span>
                  <div className="text-sm">
                    <p className="font-medium">{f.title}</p>
                    <p className="text-muted">{f.evidence}</p>
                    <p className="mt-0.5 text-[11px] text-faint">from {panelName(f.owner)}</p>
                  </div>
                </li>
              ))}
            </ol>

            <h3 className="mb-2 text-sm font-semibold">The panel's questions for you</h3>
            <div className="space-y-3">
              {review.questions?.slice(0, 3).map((q, i) => {
                const owner = OWNER_ORDER[i % 3];
                const reply = [...replies].reverse().find((r) => r.question === q);
                return (
                  <div key={i} className="rounded-xl border border-line p-3">
                    <div className="flex items-start gap-3">
                      <PanelIcon id={owner} size={30} />
                      <p className="flex-1 text-sm font-medium">{q}</p>
                      {health?.voices && (
                        <button onClick={() => playVoice(owner, q)} className="cursor-pointer rounded-lg p-1 text-muted hover:bg-paper" aria-label="Play question">
                          <Volume2 size={16} />
                        </button>
                      )}
                    </div>
                    <div className="mt-2 flex gap-2">
                      <input
                        value={drafts[i] ?? ""}
                        onChange={(e) => setDrafts((d) => ({ ...d, [i]: e.target.value }))}
                        onKeyDown={(e) => e.key === "Enter" && send(i, q)}
                        placeholder="Your answer…"
                        aria-label={`Answer to: ${q}`}
                        className="flex-1 rounded-lg border border-line bg-paper px-3 py-2 text-sm outline-none focus:border-teal"
                      />
                      <button
                        onClick={() => send(i, q)}
                        disabled={sending === i}
                        className="cursor-pointer rounded-lg bg-teal px-3 text-white disabled:opacity-50"
                        aria-label="Send answer"
                      >
                        <Send size={15} />
                      </button>
                    </div>
                    {reply && (
                      <div className="animate-fade-in mt-2 rounded-lg bg-teal-soft p-2.5 text-sm">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{reply.actor_name}</span>
                          <span className="rounded-md bg-white px-1.5 text-xs font-semibold text-teal-dark">{reply.value}/10</span>
                          {health?.voices && (
                            <button onClick={() => playVoice(reply.actor_id ?? owner, reply.reason ?? "")} className="ml-auto cursor-pointer text-teal-dark" aria-label="Play reply">
                              <Volume2 size={15} />
                            </button>
                          )}
                        </div>
                        <p className="mt-1">{reply.reason}</p>
                        {reply.follow_up && <p className="mt-1 text-muted">Follow-up: {reply.follow_up}</p>}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {review.trends && review.trends.length > 0 && (
              <div className="mt-5">
                <h3 className="mb-2 text-sm font-semibold">Trends the Trend Scout found (Telem)</h3>
                <ul className="space-y-1 text-sm">
                  {review.trends.map((t) => (
                    <li key={t.url}>
                      <a href={t.url} target="_blank" rel="noreferrer" className="text-teal-dark underline">{t.title}</a>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
        {!review && <p className="text-sm text-muted">The panel is still talking. Their verdict lands here in a moment.</p>}
      </div>
    </div>
  );
}
