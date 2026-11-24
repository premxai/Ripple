import { Area, AreaChart, CartesianGrid, Line, ReferenceDot, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ArrowDown, Info } from "lucide-react";
import { fmtTime } from "../api";
import { useStore } from "../store";

export default function DropoffChart() {
  const metricsByRound = useStore((s) => s.metricsByRound);
  const rounds = Object.keys(metricsByRound).map(Number).sort();
  const latest = rounds.length ? metricsByRound[rounds[rounds.length - 1]] : undefined;
  const first = rounds.length > 1 ? metricsByRound[rounds[0]] : undefined;

  const data = (latest?.curve ?? []).map((p) => ({
    t: p.t,
    now: p.pct,
    before: first?.curve.find((q) => q.t === p.t)?.pct,
  }));
  const drop = latest?.biggest_drop;
  const dropPoint = drop ? data.find((d) => d.t === drop.t) : undefined;

  return (
    <section className="card p-4" aria-label="Viewer drop-off">
      <div className="mb-2 flex items-center gap-1.5">
        <h2 className="text-[15px] font-semibold">Viewer drop-off</h2>
        <Info size={14} className="text-faint" aria-label="Share of the town still watching at each second" />
        {first && (
          <span className="ml-auto flex items-center gap-3 text-[11px] text-muted">
            <span className="flex items-center gap-1"><span className="h-0.5 w-3 bg-faint" /> v1</span>
            <span className="flex items-center gap-1"><span className="h-0.5 w-3 bg-teal" /> v{rounds.length}</span>
          </span>
        )}
      </div>
      {latest ? (
        <>
          <div className="h-[170px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
                <defs>
                  <linearGradient id="tealFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#0EA5A4" stopOpacity={0.22} />
                    <stop offset="100%" stopColor="#0EA5A4" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="#EBE5DA" vertical={false} />
                <XAxis dataKey="t" tickFormatter={fmtTime} tick={{ fontSize: 10, fill: "#6B665E" }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                <YAxis domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} tickFormatter={(v) => `${v}%`} tick={{ fontSize: 10, fill: "#6B665E" }} tickLine={false} axisLine={false} />
                <Tooltip
                  formatter={(v) => [`${v}%`, "still watching"]}
                  labelFormatter={(l) => fmtTime(Number(l))}
                  contentStyle={{ borderRadius: 10, border: "1px solid #EBE5DA", fontSize: 12 }}
                />
                {first && <Line type="monotone" dataKey="before" stroke="#A39D93" strokeDasharray="4 4" dot={false} strokeWidth={1.5} />}
                <Area type="monotone" dataKey="now" stroke="#0EA5A4" strokeWidth={2.2} fill="url(#tealFill)" isAnimationActive />
                {dropPoint && drop && drop.pct > 0 && (
                  <ReferenceDot x={dropPoint.t} y={dropPoint.now} r={5} fill="#0EA5A4" stroke="#fff" strokeWidth={2}
                    label={{ value: `${fmtTime(dropPoint.t)} · ${dropPoint.now}%`, position: "top", fontSize: 11, fill: "#0B8584", fontWeight: 600 }} />
                )}
              </AreaChart>
            </ResponsiveContainer>
          </div>
          {drop && drop.pct > 0 && (
            <div className="mt-2 flex items-start gap-2 rounded-xl border border-line bg-paper px-3 py-2 text-xs">
              <ArrowDown size={14} className="mt-0.5 text-red" />
              <div>
                <p className="font-medium">Biggest drop at {fmtTime(drop.t)}</p>
                <p className="text-muted">{drop.pct} points of the town left here.</p>
              </div>
            </div>
          )}
        </>
      ) : (
        <div className="grid h-[150px] place-items-center rounded-xl border border-dashed border-line text-center text-xs text-muted">
          The curve draws itself once the town has watched.
        </div>
      )}
    </section>
  );
}
