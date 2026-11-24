import { useEffect, useRef, useState } from "react";
import { Loader2, Maximize, Pause, Play, Sparkles, Upload } from "lucide-react";
import { api, fmtTime } from "../api";
import { useStore } from "../store";

export default function VideoPanel() {
  const { video, caption, phase, runs } = useStore();
  const setVideo = useStore((s) => s.setVideo);
  const setCaption = useStore((s) => s.setCaption);
  const setPhase = useStore((s) => s.setPhase);
  const addRun = useStore((s) => s.addRun);
  const setError = useStore((s) => s.setError);
  const fileRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  const [t, setT] = useState(0);
  const [dragging, setDragging] = useState(false);

  // Frame follows the video's shape: phone for vertical, square, or a wide player for landscape.
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);
  const w = video?.width || natural?.w;
  const h = video?.height || natural?.h;
  const ratio = w && h ? w / h : 9 / 16;
  const shape: "vertical" | "square" | "landscape" = ratio > 1.15 ? "landscape" : ratio > 0.85 ? "square" : "vertical";
  const frameClass = {
    vertical: "mx-auto aspect-[9/16] w-full max-w-[250px] rounded-[26px] border-[5px] border-ink shadow-lg",
    square: "mx-auto aspect-square w-full max-w-[320px] rounded-2xl border border-line shadow-md",
    landscape: "aspect-video w-full rounded-xl border border-line shadow-md",
  }[video ? shape : "vertical"];

  const nextRound = runs.length + 1;
  const lastRun = runs[runs.length - 1];
  const canPost = !!video && phase === "ready";
  const waitingForV2 = phase === "review" || phase === "done";

  // Play along while the town watches.
  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    if (phase === "simulating") {
      el.currentTime = 0;
      el.play().catch(() => undefined);
    }
  }, [phase]);

  async function load(promise: Promise<Awaited<ReturnType<typeof api.sample>>>) {
    setError(undefined);
    setPhase("analyzing");
    try {
      const v = await promise;
      setVideo(v);
      setPhase("ready");
    } catch (e) {
      setError(`Upload failed: ${String(e)}`);
      setPhase(video ? "ready" : "idle");
    }
  }

  async function post() {
    if (!video) return;
    setError(undefined);
    try {
      const { run_id, round } = await api.run(video.video_id, caption, lastRun?.run_id);
      addRun({ run_id, round, video, caption });
      setPhase("simulating");
    } catch (e) {
      setError(`Could not start the town: ${String(e)}`);
    }
  }

  function toggle() {
    const el = videoRef.current;
    if (!el) return;
    if (el.paused) el.play().catch(() => undefined);
    else el.pause();
  }

  const onFiles = (files: FileList | null) => {
    const f = files?.[0];
    if (f) load(api.upload(f));
  };

  return (
    <section className="card p-4" aria-label="Launch video">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-[15px] font-semibold">Launch Video</h2>
        {video && (
          <span className="ml-auto mr-2 rounded-full border border-line px-2 py-0.5 text-[11px] capitalize text-muted">
            {shape}
          </span>
        )}
        {runs.length > 0 && (
          <span className="rounded-full bg-teal-soft px-2 py-0.5 text-xs font-medium text-teal-dark">
            v{Math.max(1, phase === "ready" ? nextRound : runs.length)}
          </span>
        )}
      </div>

      <div
        className={`relative overflow-hidden bg-ink ${frameClass} ${dragging ? "ring-4 ring-teal/40" : ""}`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          onFiles(e.dataTransfer.files);
        }}
      >
        {video ? (
          <>
            <video
              ref={videoRef}
              src={video.url}
              className={`h-full w-full ${shape === "vertical" ? "object-cover" : "object-contain"}`}
              onLoadedMetadata={(e) => setNatural({ w: e.currentTarget.videoWidth, h: e.currentTarget.videoHeight })}
              playsInline
              muted
              loop
              onPlay={() => setPlaying(true)}
              onPause={() => setPlaying(false)}
              onTimeUpdate={(e) => setT(e.currentTarget.currentTime)}
            />
            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-3 pb-3 pt-8 text-white">
              <div className="mb-2 h-1 overflow-hidden rounded-full bg-white/25">
                <div className="h-full bg-white" style={{ width: `${(t / (video.duration || 1)) * 100}%` }} />
              </div>
              <div className="flex items-center gap-2 text-xs tabular">
                <button onClick={toggle} aria-label={playing ? "Pause" : "Play"} className="cursor-pointer">
                  {playing ? <Pause size={16} fill="white" /> : <Play size={16} fill="white" />}
                </button>
                <span>
                  {fmtTime(t)} / {fmtTime(video.duration)}
                </span>
                <button
                  className="ml-auto cursor-pointer"
                  aria-label="Full screen"
                  onClick={() => videoRef.current?.requestFullscreen?.()}
                >
                  <Maximize size={14} />
                </button>
              </div>
            </div>
          </>
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-3 px-5 text-center text-white">
            {phase === "analyzing" ? (
              <>
                <Loader2 className="animate-spin" />
                <p className="text-sm text-white/80">Pulling key frames and the transcript…</p>
              </>
            ) : (
              <>
                <span className="grid h-12 w-12 place-items-center rounded-full bg-white/10">
                  <Upload size={20} />
                </span>
                <p className="text-sm font-medium">Drop your launch video</p>
                <p className="text-xs text-white/60">MP4 or MOV, vertical works best</p>
                <button
                  className="mt-1 cursor-pointer rounded-full bg-white px-4 py-1.5 text-xs font-semibold text-ink"
                  onClick={() => fileRef.current?.click()}
                >
                  Choose file
                </button>
                <button className="cursor-pointer text-xs text-white/70 underline" onClick={() => load(api.sample())}>
                  Use a sample video
                </button>
              </>
            )}
          </div>
        )}
      </div>
      <input
        ref={fileRef}
        type="file"
        accept="video/*"
        hidden
        onChange={(e) => {
          onFiles(e.target.files);
          e.target.value = "";
        }}
      />

      <div className="mt-4 space-y-2">
        {(canPost || phase === "idle") && (
          <>
            <label htmlFor="caption" className="text-xs font-medium text-muted">
              Caption
            </label>
            <input
              id="caption"
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              placeholder="Build once. Launch everywhere."
              className="w-full rounded-xl border border-line bg-paper px-3 py-2 text-sm outline-none focus:border-teal"
            />
          </>
        )}
        {canPost && (
          <button
            onClick={post}
            className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-teal py-2.5 text-sm font-semibold text-white transition hover:bg-teal-dark"
          >
            <Sparkles size={16} /> Post v{nextRound} to the town
          </button>
        )}
        {waitingForV2 && (
          <button
            onClick={() => fileRef.current?.click()}
            className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl border border-teal py-2.5 text-sm font-semibold text-teal-dark transition hover:bg-teal-soft"
          >
            <Upload size={16} /> Upload v{runs.length + 1} (your edit)
          </button>
        )}
        {waitingForV2 && video && (
          <button
            onClick={() => setPhase("ready")}
            className="w-full cursor-pointer text-xs text-muted underline"
          >
            or re-post this same video as v{runs.length + 1}
          </button>
        )}
      </div>
    </section>
  );
}
