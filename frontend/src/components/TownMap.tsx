/**
 * The illustrated town: a big isometric map image with live residents, emoji reactions,
 * share ripples and clickable districts on top. Pan with drag, zoom with wheel/pinch.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { TransformComponent, TransformWrapper, type ReactZoomPanPinchRef } from "react-zoom-pan-pinch";
import { Minus, Plus, Scan, Tag } from "lucide-react";
import { MAP, PLACE_BY_ID, PLACES, slot } from "../mapConfig";
import { useStore } from "../store";
import type { Resident } from "../types";
import Emoji from "./Emoji";

const SKIN = ["#F1C9A5", "#C98E63", "#8D5A3C", "#E8B48A", "#A86F4C"];
const HAIR = ["#2E2620", "#5B3A29", "#1E1B18", "#8C5A2B", "#3B2F2A"];

function Person({ r, idx, x, y, onSelect, selected }: {
  r: Resident; idx: number; x: number; y: number; selected: boolean; onSelect: () => void;
}) {
  const view = useStore((s) => s.residents[r.id]);
  const [now, setNow] = useState(() => performance.now());
  useEffect(() => {
    if (!view?.bubble) return;
    setNow(performance.now());
    const t = setTimeout(() => setNow(performance.now()), 6200);
    return () => clearTimeout(t);
  }, [view?.bubble]);
  const showBubble = view?.bubble && now - view.bubble.at < 6000;
  const scrolled = view?.status === "scrolled";
  const ring =
    view?.status === "engaged" ? "#22A06B" : view?.status === "watching" ? "#0EA5A4" : scrolled ? "#E5484D" : "transparent";

  return (
    <button
      id={`res-${r.id}`}
      onClick={(e) => {
        e.stopPropagation();
        onSelect();
      }}
      className="group absolute cursor-pointer outline-none"
      style={{
        left: `${x}%`,
        top: `${y}%`,
        zIndex: Math.round(y * 10) + (selected ? 2000 : 100),
        transition: "left 2.4s cubic-bezier(.45,.05,.35,1), top 2.4s cubic-bezier(.45,.05,.35,1)",
      }}
      aria-label={`${r.name}, ${r.tag}`}
    >
      <div className="sprite relative -translate-x-1/2 -translate-y-full" style={{ transformOrigin: "50% 100%" }}>
        {/* ground ring: teal watching, green engaged, red scrolled */}
        <span
          className={`absolute bottom-[-5px] left-1/2 h-[12px] w-[34px] -translate-x-1/2 rounded-[50%] border-2 ${
            view?.status === "watching" ? "animate-pulse" : ""
          }`}
          style={{ borderColor: ring, background: ring === "transparent" ? "rgba(0,0,0,.12)" : `${ring}22` }}
        />
        {selected && <span className="absolute bottom-[-9px] left-1/2 h-[18px] w-[46px] -translate-x-1/2 rounded-[50%] border-2 border-ink" />}
        <svg width="26" height="40" viewBox="0 0 26 40" className={`relative ${scrolled ? "opacity-55" : ""} drop-shadow-[0_2px_2px_rgba(0,0,0,.25)] transition group-hover:-translate-y-0.5`}>
          <rect x="6" y="17" width="14" height="17" rx="6" fill={r.color} stroke="#fff" strokeWidth="1.5" />
          <rect x="8" y="32" width="4" height="7" rx="2" fill="#3A3A3A" />
          <rect x="14" y="32" width="4" height="7" rx="2" fill="#3A3A3A" />
          <circle cx="13" cy="11" r="7.5" fill={SKIN[idx % SKIN.length]} stroke="#fff" strokeWidth="1.5" />
          <path d="M5.6 10.5a7.4 7.4 0 0 1 14.8 0c-2.5-2.6-9.8-3.2-14.8 0z" fill={HAIR[idx % HAIR.length]} />
        </svg>
        {view?.thinking ? (
          <span className="absolute bottom-[44px] left-1/2 flex -translate-x-1/2 gap-0.5 rounded-full bg-white px-2 py-1 text-[11px] leading-none text-muted shadow-md">
            <span className="dot">●</span><span className="dot">●</span><span className="dot">●</span>
          </span>
        ) : showBubble ? (
          <span key={view!.bubble!.at} className="animate-pop absolute bottom-[42px] left-1/2 -translate-x-1/2">
            <span className="relative grid h-[38px] w-[38px] place-items-center rounded-full bg-white shadow-[0_4px_12px_rgba(0,0,0,.18)]">
              <Emoji char={view!.bubble!.emoji} size={26} />
              <span className="absolute -bottom-[5px] left-1/2 h-2.5 w-2.5 -translate-x-1/2 rotate-45 bg-white" />
            </span>
          </span>
        ) : null}
        <span
          className={`absolute left-1/2 top-[42px] -translate-x-1/2 whitespace-nowrap rounded-full bg-white/95 px-1.5 py-px text-[10px] font-semibold text-ink shadow-sm transition-opacity ${
            selected ? "opacity-100" : "opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100"
          }`}
        >
          {r.name} · {r.tag}
        </span>
      </div>
    </button>
  );
}

function Ripple({ x, y, born }: { x: number; y: number; born: number }) {
  const [alive, setAlive] = useState(true);
  useEffect(() => {
    const t = setTimeout(() => setAlive(false), Math.max(0, 6500 - (performance.now() - born)));
    return () => clearTimeout(t);
  }, [born]);
  if (!alive) return null;
  return (
    <div className="pointer-events-none absolute" style={{ left: `${x}%`, top: `${y}%`, zIndex: 50 }}>
      {[0, 0.6, 1.2].map((d) => (
        <span
          key={d}
          className="ripple-ring absolute left-0 top-0 h-[60px] w-[110px] rounded-[50%] border-[3px] border-teal"
          style={{ animationDelay: `${d}s` }}
        />
      ))}
    </div>
  );
}

export default function TownMap() {
  const town = useStore((s) => s.town)!;
  const residents = useStore((s) => s.residents);
  const ripples = useStore((s) => s.ripples);
  const labels = useStore((s) => s.labels);
  const selection = useStore((s) => s.selection);
  const select = useStore((s) => s.select);
  const wrapRef = useRef<HTMLDivElement>(null);
  const apiRef = useRef<ReactZoomPanPinchRef>(null);
  const [fit, setFit] = useState(0.4);
  const placeName = useMemo(() => Object.fromEntries(town.locations.map((l) => [l.id, l.name])), [town]);

  // Fit the whole island into the container, and keep it fitted on resize.
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      // The image has white margins, so a slightly-over "contain" fit fills the panel nicely.
      let s = Math.min(el.clientWidth / MAP.width, el.clientHeight / MAP.height) * 1.04;
      // Tall, narrow panels (phones): zoom in so the island fills the height; drag to pan.
      if (el.clientHeight > MAP.height * s * 1.25) s = (el.clientHeight / MAP.height) * 0.8;
      setFit(s);
      apiRef.current?.centerView(s, 0);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Fly to a resident when something outside the map (decision log, inspector) asks for it.
  useEffect(() => {
    if (selection?.kind === "resident" && selection.focus) {
      apiRef.current?.zoomToElement(`res-${selection.id}`, Math.max(fit * 2.4, 0.9), 650);
    }
  }, [selection, fit]);

  // Where each resident stands right now.
  const positions = useMemo(() => {
    const groups: Record<string, string[]> = {};
    town.residents.forEach((r) => {
      const where = residents[r.id]?.location ?? r.home;
      (groups[where] ||= []).push(r.id);
    });
    const out: Record<string, [number, number]> = {};
    town.residents.forEach((r) => {
      const where = residents[r.id]?.location ?? r.home;
      const place = PLACE_BY_ID[where] ?? PLACE_BY_ID.town_square;
      const members = groups[where] ?? [r.id];
      const [dx, dy] = slot(members.indexOf(r.id), members.length);
      out[r.id] = [place.spot[0] + dx, place.spot[1] + dy];
    });
    return out;
  }, [town, residents]);

  return (
    <div ref={wrapRef} className="absolute inset-0" onClick={() => select(undefined)}>
      <TransformWrapper
        ref={apiRef}
        initialScale={fit}
        minScale={fit * 0.8}
        maxScale={2.2}
        limitToBounds={false}
        centerOnInit
        wheel={{ step: 0.08 }}
        doubleClick={{ mode: "zoomIn", step: 0.6 }}
        onTransform={(_ref: ReactZoomPanPinchRef, state: { scale: number }) => {
          // Keep people and bubbles readable: they shrink less than the map when zooming out.
          wrapRef.current?.style.setProperty("--sprite", String(Math.min(2.6, Math.pow(state.scale, -0.62))));
        }}
      >
        <TransformComponent wrapperClass="!h-full !w-full" contentClass="">
          <div className="relative select-none" style={{ width: MAP.width, height: MAP.height }}>
            <img
              src={MAP.src}
              alt="Isometric map of the town"
              width={MAP.width}
              height={MAP.height}
              draggable={false}
              className="block h-full w-full"
              style={{ backgroundImage: `url(${MAP.small})`, backgroundSize: "cover" }}
            />
            {PLACES.map((p) => {
              const selected = selection?.kind === "place" && selection.id === p.id;
              const Icon = p.icon;
              return (
                <div key={p.id}>
                  <button
                    aria-label={placeName[p.id] ?? p.id}
                    onClick={(e) => {
                      e.stopPropagation();
                      select({ kind: "place", id: p.id });
                    }}
                    className={`absolute cursor-pointer rounded-[28px] transition ${
                      selected ? "bg-teal/10 ring-4 ring-teal/60" : "hover:bg-white/15 hover:ring-4 hover:ring-white/70"
                    }`}
                    style={{ left: `${p.box.x}%`, top: `${p.box.y}%`, width: `${p.box.w}%`, height: `${p.box.h}%`, zIndex: 10 }}
                  />
                  {labels && (
                    <span
                      className="sprite pointer-events-none absolute flex -translate-x-1/2 items-center gap-1 whitespace-nowrap rounded-full bg-white/95 px-2.5 py-1 text-[12px] font-semibold text-ink shadow-[0_2px_10px_rgba(0,0,0,.12)]"
                      style={{ left: `${p.box.x + p.box.w / 2}%`, top: `${p.box.y + 1}%`, zIndex: 3000, transformOrigin: "50% 0%" }}
                    >
                      <Icon size={13} className="text-teal" /> {placeName[p.id] ?? p.id}
                    </span>
                  )}
                </div>
              );
            })}
            {ripples.map((rp) => {
              const pos = positions[rp.residentId];
              return pos ? <Ripple key={rp.id} x={pos[0]} y={pos[1]} born={rp.at} /> : null;
            })}
            {town.residents.map((r, i) => (
              <Person
                key={r.id}
                r={r}
                idx={i}
                x={positions[r.id][0]}
                y={positions[r.id][1]}
                selected={selection?.kind === "resident" && selection.id === r.id}
                onSelect={() => select({ kind: "resident", id: r.id })}
              />
            ))}
          </div>
        </TransformComponent>
      </TransformWrapper>
      <MapZoomControls api={apiRef} fit={fit} />
    </div>
  );
}


function MapZoomControls({ api, fit }: { api: React.RefObject<ReactZoomPanPinchRef | null>; fit: number }) {
  const labels = useStore((s) => s.labels);
  const setLabels = useStore((s) => s.setLabels);
  const btn = "grid h-9 w-9 cursor-pointer place-items-center text-ink transition hover:bg-paper";
  return (
    <div className="absolute bottom-3 left-3 z-[4000] flex flex-col overflow-hidden rounded-xl border border-line bg-white shadow-sm" onClick={(e) => e.stopPropagation()}>
      <button className={btn} onClick={() => api.current?.zoomIn(0.4)} aria-label="Zoom in" title="Zoom in"><Plus size={16} /></button>
      <button className={btn} onClick={() => api.current?.zoomOut(0.4)} aria-label="Zoom out" title="Zoom out"><Minus size={16} /></button>
      <button className={btn} onClick={() => api.current?.centerView(fit, 400)} aria-label="Fit town" title="Fit town"><Scan size={16} /></button>
      <button className={`${btn} ${labels ? "text-teal" : ""}`} onClick={() => setLabels(!labels)} aria-label="Toggle labels" title="Labels"><Tag size={16} /></button>
    </div>
  );
}
