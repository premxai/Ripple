import { useEffect } from "react";
import { api, connectEvents } from "./api";
import { useStore } from "./store";
import Header from "./components/Header";
import VideoPanel from "./components/VideoPanel";
import DropoffChart from "./components/DropoffChart";
import TownView from "./components/TownView";
import DecisionLog from "./components/DecisionLog";
import PanelCard from "./components/PanelCard";
import ReportCard from "./components/ReportCard";
import PanelDialog from "./components/PanelDialog";

/**
 * Layout by screen size:
 *  - phone:   town, video, log, panel, chart, report (one column)
 *  - tablet:  town full width, then video|log and chart|panel
 *  - desktop: video+chart | big town | log+panel, report underneath
 * A landscape video gets a wider left column on desktop.
 */
export default function App() {
  const setTown = useStore((s) => s.setTown);
  const handleEvent = useStore((s) => s.handleEvent);
  const setError = useStore((s) => s.setError);
  const error = useStore((s) => s.error);
  const video = useStore((s) => s.video);
  const landscape = !!video?.width && !!video?.height && video.width / video.height > 1.15;

  useEffect(() => {
    Promise.all([api.town(), api.health()])
      .then(([t, h]) => setTown(t, h))
      .catch(() => setError("Can't reach the Ripple API on port 8000. Is the backend running?"));
    return connectEvents(handleEvent);
  }, [setTown, handleEvent, setError]);

  return (
    <div className="mx-auto flex min-h-full max-w-[1760px] flex-col gap-4 p-3 sm:p-5">
      <Header />
      {error && (
        <div className="card animate-fade-in border-red/30 bg-red-soft px-4 py-3 text-sm text-red" role="alert">
          {error}
        </div>
      )}
      <main
        className={`grid gap-4 grid-cols-1 [grid-template-areas:'town'_'video'_'log'_'panel'_'chart'] md:grid-cols-2 md:[grid-template-areas:'town_town'_'video_log'_'chart_panel'] xl:[grid-template-areas:'video_town_log'_'chart_town_panel'] ${
          landscape ? "xl:grid-cols-[420px_minmax(0,1fr)_340px]" : "xl:grid-cols-[300px_minmax(0,1fr)_340px]"
        }`}
      >
        <div className="h-[62vh] min-h-[380px] [grid-area:town] md:h-[560px] xl:h-auto xl:min-h-[640px]">
          <TownView />
        </div>
        <div className="[grid-area:video]"><VideoPanel /></div>
        <div className="[grid-area:chart]"><DropoffChart /></div>
        <div className="min-w-0 [grid-area:log]"><DecisionLog /></div>
        <div className="[grid-area:panel]"><PanelCard /></div>
      </main>
      <ReportCard />
      <PanelDialog />
    </div>
  );
}
