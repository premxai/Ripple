import { useEffect, useState } from "react";
import { animate } from "motion";
import { ArrowDown, ArrowRight, BarChart3, ChevronRight, Eye, Lightbulb, Share2 } from "lucide-react";
import { useStore } from "../store";

function CountUp({ value, className }: { value: number; className?: string }) {
  const [shown, setShown] = useState(value);
  useEffect(() => {
    const controls = animate(shown, value, { duration: 1.1, ease: "easeOut", onUpdate: (v) => setShown(Math.round(v)) });
    return () => controls.stop();
  }, [value]); // eslint-disable-line react-hooks/exhaustive-deps
  return <span className={`tabular ${className ?? ""}`}>{shown}</span>;
}

function Stat({ icon, label, pct, color, soft, sub, chip, chipTone }: {
  icon: React.ReactNode; label: string; pct?: number; color: string; soft: string; sub: string; chip: string; chipTone: string;
}) {
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-2 px-2">
      <div className="flex items-center gap-2.5">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full" style={{ background: soft, color }}>{icon}</span>
        <span className="text-[17px] font-semibold">{label}</span>
        <span className="ml-auto text-[22px] font-semibold tabular" style={{ color }}>
          {pct === undefined ? "–" : <><CountUp value={pct} />%</>}
        </span>
      </div>
      <div className="h-2.5 overflow-hidden rounded-full" style={{ background: soft }}>
        <div className="h-full rounded-full transition-[width] duration-700" style={{ width: `${pct ?? 0}%`, background: color }} />
      </div>
      <div className="flex items-center justify-between text-xs text-muted">
        <span>{sub}</span>
        {pct !== undefined && <span className={`rounded-md px-2 py-0.5 font-medium ${chipTone}`}>{chip}</span>}
      </div>
    </div>
  );
}

export default function ReportCard() {
  const metricsByRound = useStore((s) => s.metricsByRound);
  const review = useStore((s) => s.review);
  const report = useStore((s) => s.report);
  const setPanelOpen = useStore((s) => s.setPanelOpen);
  const rounds = Object.keys(metricsByRound).map(Number).sort();
  const first = rounds.length ? metricsByRound[rounds[0]] : undefined;
  const latest = rounds.length ? metricsByRound[rounds[rounds.length - 1]] : undefined;

  const before = report ? report.v1.score : first?.score;
  const after = report ? report.v2.score : review?.predicted_score_after_fixes;
  const caption = report ? "After one round of edits" : after !== undefined ? "Potential lift with the panel's fixes" : "Post a video to get a score";
  const insight = report?.what_changed ?? (review?.fixes?.[0] ? `${review.fixes[0].title}. ${review.fixes[0].evidence}` : undefined);

  const scrolled = latest?.scrolled_pct;
  const watched = latest?.watched_pct;
  const shared = latest?.shared_pct;

  return (
    <section className="card flex flex-col gap-5 p-5 lg:flex-row lg:items-center" aria-label="Report card">
      <div className="flex items-center gap-4 lg:w-[290px] lg:border-r lg:border-line lg:pr-5">
        <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-teal-soft text-teal">
          <BarChart3 size={22} />
        </span>
        <div>
          <p className="text-[15px] font-medium text-muted">Ripple Score</p>
          <p className="flex items-center gap-2 text-[46px] font-semibold leading-none tracking-tight">
            {before === undefined ? <span className="text-faint">–</span> : <CountUp value={before} />}
            {after !== undefined && (
              <>
                <ArrowRight className="text-faint" size={30} />
                <CountUp value={after} className="text-teal" />
              </>
            )}
          </p>
          <p className="mt-1 text-xs text-muted">{caption}</p>
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-5 md:flex-row md:divide-x md:divide-line">
        <Stat icon={<ArrowDown size={18} />} label="Scrolled" pct={scrolled} color="#E5484D" soft="#FDECEC"
          sub="Lost interest early" chip={(scrolled ?? 0) > 40 ? "High drop-off" : "Okay"}
          chipTone={(scrolled ?? 0) > 40 ? "bg-red-soft text-red" : "bg-paper text-muted"} />
        <Stat icon={<Eye size={18} />} label="Watched" pct={watched} color="#E8961A" soft="#FEF4E2"
          sub="Stayed to the end" chip={(watched ?? 0) >= 40 ? "Good" : "Needs work"}
          chipTone={(watched ?? 0) >= 40 ? "bg-amber-soft text-[#9a6408]" : "bg-paper text-muted"} />
        <Stat icon={<Share2 size={18} />} label="Shared" pct={shared} color="#0EA5A4" soft="#E3F4F3"
          sub="Spreading the word" chip={(shared ?? 0) >= 20 ? "Spreading" : "Room to grow"}
          chipTone="bg-teal-soft text-teal-dark" />
      </div>

      <div className="rounded-2xl border border-line p-4 lg:w-[300px]">
        <div className="mb-2 flex items-center gap-2">
          <Lightbulb size={18} className="text-teal" />
          <p className="text-[15px] font-semibold">{report ? report.headline : "Top insight"}</p>
        </div>
        <p className="mb-3 text-sm text-muted">{insight ?? "The panel's top fix appears here after the first round."}</p>
        <button
          onClick={() => setPanelOpen(true)}
          disabled={!review}
          className="flex w-full cursor-pointer items-center justify-center gap-1 rounded-xl bg-teal py-2.5 text-sm font-semibold text-white transition hover:bg-teal-dark disabled:cursor-not-allowed disabled:opacity-40"
        >
          See the panel's fixes <ChevronRight size={16} />
        </button>
      </div>
    </section>
  );
}
