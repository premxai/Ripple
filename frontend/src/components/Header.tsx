import { useStore } from "../store";

export function Logo({ size = 40 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" aria-hidden>
      <circle cx="20" cy="20" r="19" fill="#E3F4F3" />
      <path d="M8 22a12 12 0 0 1 24 0" stroke="#0EA5A4" strokeWidth="3.4" fill="none" strokeLinecap="round" />
      <path d="M13 23a7 7 0 0 1 14 0" stroke="#0EA5A4" strokeWidth="3.4" fill="none" strokeLinecap="round" opacity=".7" />
      <circle cx="20" cy="24" r="2.6" fill="#0EA5A4" />
    </svg>
  );
}

const PHASE_LABEL: Record<string, string> = {
  idle: "Add a launch video",
  analyzing: "Watching your video…",
  ready: "Ready to post",
  simulating: "The town is watching",
  review: "Panel review",
  done: "Report card ready",
};

export default function Header() {
  const health = useStore((s) => s.health);
  const phase = useStore((s) => s.phase);
  const live = phase === "simulating" || phase === "analyzing";
  return (
    <header className="flex flex-wrap items-center gap-4">
      <div className="flex items-center gap-3">
        <Logo />
        <span className="text-[30px] font-bold tracking-tight">Ripple</span>
      </div>
      <div className="hidden h-9 w-px bg-line sm:block" />
      <p className="hidden max-w-[230px] text-[15px] leading-snug text-muted sm:block">Test your launch video on a town of AI people.</p>
      <div className="ml-auto flex flex-wrap items-center justify-end gap-2 text-xs sm:text-sm">
        {health?.mock && (
          <span className="rounded-full bg-amber-soft px-3 py-1 font-medium text-[#9a6408]" title="Rule-based residents, no model calls">
            Mock mode
          </span>
        )}
        {health && (
          <span className="rounded-full border border-line bg-card px-3 py-1 text-muted">
            {health.residents} residents · {health.labs} AI labs
          </span>
        )}
        <span className="flex items-center gap-2 rounded-full border border-line bg-card px-3 py-1 font-medium">
          <span className={`h-2 w-2 rounded-full ${live ? "animate-pulse bg-teal" : "bg-faint"}`} />
          {PHASE_LABEL[phase]}
        </span>
      </div>
    </header>
  );
}
