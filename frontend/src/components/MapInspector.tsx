import { Crosshair, MessagesSquare, Users, X } from "lucide-react";
import { fmtTime } from "../api";
import { PLACE_BY_ID } from "../mapConfig";
import { useStore } from "../store";
import Avatar from "./Avatar";
import Emoji from "./Emoji";

const ACTION_TEXT: Record<string, string> = {
  scroll: "Scrolled away",
  keep_watching: "Kept watching",
  like: "Liked it",
  comment: "Commented",
  share: "Shared it",
  rewatch: "Came back via a share",
  ignore: "Ignored a share",
};

/** Details card for whatever was clicked on the map: a resident or a district. */
export default function MapInspector() {
  const selection = useStore((s) => s.selection);
  const select = useStore((s) => s.select);
  const town = useStore((s) => s.town);
  const residents = useStore((s) => s.residents);
  const log = useStore((s) => s.log);
  const activeRunId = useStore((s) => s.activeRunId);
  if (!selection || !town) return null;

  const close = (
    <button onClick={() => select(undefined)} className="cursor-pointer rounded-lg p-1 text-muted hover:bg-paper" aria-label="Close details">
      <X size={16} />
    </button>
  );
  // Phones: a bottom sheet over the page. Larger screens: a card in the map's top-right corner.
  const shell =
    "card animate-fade-in z-[4500] overflow-y-auto p-4 fixed inset-x-2 bottom-2 max-h-[60vh] shadow-2xl " +
    "sm:absolute sm:inset-x-auto sm:bottom-auto sm:right-3 sm:top-3 sm:w-[320px] sm:max-h-[calc(100%-24px)] sm:shadow-md";

  if (selection.kind === "resident") {
    const r = town.residents.find((x) => x.id === selection.id);
    if (!r) return null;
    const mine = log.filter((e) => e.actor_id === r.id && e.run_id === activeRunId).slice().reverse();
    const view = residents[r.id];
    const where = town.locations.find((l) => l.id === view?.location)?.name ?? "around town";
    return (
      <aside className={shell} onClick={(e) => e.stopPropagation()} aria-label={`${r.name} details`}>
        <div className="flex items-start gap-3">
          <Avatar id={r.id} name={r.name} color={r.color} size={48} ring />
          <div className="min-w-0 flex-1">
            <p className="text-base font-semibold">{r.name}, {r.age}</p>
            <p className="text-xs text-muted">{r.tag} · at {where}</p>
          </div>
          {close}
        </div>
        <p className="mt-3 text-sm text-muted">{r.bio}</p>
        <div className="mt-3 flex flex-wrap gap-1.5 text-[11px]">
          <span className="rounded-md bg-teal-soft px-2 py-0.5 font-medium text-teal-dark">{r.lab}</span>
          <span className="rounded-md bg-paper px-2 py-0.5 font-mono text-muted">{r.model}</span>
          {r.communities.map((c) => (
            <span key={c} className="rounded-md border border-line px-2 py-0.5 text-muted">
              {town.communities.find((x) => x.id === c)?.name ?? c}
            </span>
          ))}
        </div>
        <h3 className="mb-1.5 mt-4 text-xs font-semibold uppercase tracking-wide text-muted">This run</h3>
        {mine.length === 0 ? (
          <p className="text-sm text-muted">No decisions yet. Post a video to see what {r.name} thinks.</p>
        ) : (
          <ol className="space-y-2">
            {mine.map((e) => (
              <li key={e.event_id} className="flex gap-2 text-sm">
                <span className="mt-0.5"><Emoji char={e.feeling ?? "👀"} size={18} /></span>
                <div>
                  <p className="font-medium">
                    {ACTION_TEXT[e.action ?? ""] ?? e.action}
                    {e.type === "decision" && <span className="font-normal text-muted"> at {fmtTime(e.video_t ?? 0)}</span>}
                  </p>
                  {e.reason && <p className="font-mono text-[11px] text-muted">"{e.reason}"</p>}
                </div>
              </li>
            ))}
          </ol>
        )}
        <button
          onClick={() => select({ kind: "resident", id: r.id, focus: true })}
          className="mt-4 flex w-full cursor-pointer items-center justify-center gap-1.5 rounded-xl border border-line py-2 text-xs font-medium hover:bg-paper"
        >
          <Crosshair size={14} /> Zoom to {r.name}
        </button>
      </aside>
    );
  }

  const loc = town.locations.find((l) => l.id === selection.id);
  const place = PLACE_BY_ID[selection.id];
  if (!loc || !place) return null;
  const Icon = place.icon;
  const here = town.residents.filter((r) => residents[r.id]?.location === loc.id);
  const community = town.communities.find((c) => c.id === loc.community);
  const roomPosts = community ? log.filter((e) => e.type === "ripple" && e.community === community.id) : [];

  return (
    <aside className={shell} onClick={(e) => e.stopPropagation()} aria-label={`${loc.name} details`}>
      <div className="flex items-start gap-3">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-teal-soft text-teal"><Icon size={20} /></span>
        <div className="min-w-0 flex-1">
          <p className="text-base font-semibold">{loc.name}</p>
          <p className="text-xs text-muted">{loc.blurb}</p>
        </div>
        {close}
      </div>
      {community && (
        <div className="mt-4 rounded-xl border border-line p-3">
          <p className="flex items-center gap-1.5 text-sm font-medium"><MessagesSquare size={15} className="text-teal" /> {community.name}</p>
          <p className="mt-0.5 text-xs text-muted">A BAND room. When someone here shares the video, it's posted in this room and @-mentions friends who scrolled past.</p>
          <div className="mt-2 flex -space-x-2">
            {community.members.map((id) => {
              const m = town.residents.find((x) => x.id === id)!;
              return <Avatar key={id} id={id} name={m.name} color={m.color} size={26} ring />;
            })}
          </div>
          {roomPosts.length > 0 && (
            <ul className="mt-3 space-y-1.5 border-t border-line pt-2">
              {roomPosts.map((e) => (
                <li key={e.event_id} className="text-xs">
                  <span className="font-semibold">{e.actor_name}:</span> <span className="text-muted">"{e.reason}"</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      <h3 className="mb-1.5 mt-4 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted"><Users size={13} /> Here now</h3>
      {here.length === 0 ? (
        <p className="text-sm text-muted">Nobody right now.</p>
      ) : (
        <ul className="space-y-1.5">
          {here.map((r) => (
            <li key={r.id}>
              <button onClick={() => select({ kind: "resident", id: r.id, focus: true })} className="flex w-full cursor-pointer items-center gap-2 rounded-lg p-1 text-left hover:bg-paper">
                <Avatar id={r.id} name={r.name} color={r.color} size={28} />
                <span className="text-sm font-medium">{r.name}</span>
                <span className="text-xs text-muted">{r.tag}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </aside>
  );
}
