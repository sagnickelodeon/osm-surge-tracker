"use client";

/**
 * Component 3b — dashboard entry page.
 *
 * Header metrics, a 70/30 map + live feed split, the 7-day history below, and a footer.
 * SWR polls the four endpoints every REFRESH_INTERVAL_MS and keeps last-good data on
 * failure, so the page refreshes in place and degrades gracefully when the API is down.
 */

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import useSWR from "swr";

import {
  EMPTY_STATS,
  fetchActiveSurges,
  fetchHeatmap,
  fetchStats,
  fetchSurgeHistory,
} from "@/lib/api";
import { ACCENT_COMING, ACCENT_NEW, REFRESH_INTERVAL_MS } from "@/lib/config";
import { nowIST } from "@/lib/time";
import Header from "@/components/Header";
import SurgeFeed from "@/components/SurgeFeed";
import HistoryTable from "@/components/HistoryTable";
import Footer from "@/components/Footer";
import TutorialModal from "@/components/TutorialModal";
import ChangelogModal from "@/components/ChangelogModal";
import FeedbackModal from "@/components/FeedbackModal";
import WelcomeModal from "@/components/WelcomeModal";

// Bump this key to re-show the intro to everyone (e.g. after a major UI change).
const INTRO_SEEN_KEY = "osm_surge_seen_intro";

// deck.gl + maplibre are browser-only; never server-render the map.
const SurgeMap = dynamic(() => import("@/components/SurgeMap"), {
  ssr: false,
  loading: () => (
    <div
      style={{
        height: 720,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: "#888",
      }}
    >
      Loading map…
    </div>
  ),
});

const swrOpts = {
  refreshInterval: REFRESH_INTERVAL_MS,
  keepPreviousData: true,
  revalidateOnFocus: false,
};

export default function DashboardPage() {
  const [lastUpdated, setLastUpdated] = useState<string>("—");
  const [tutorialOpen, setTutorialOpen] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [welcomeOpen, setWelcomeOpen] = useState(false);
  const [whatsNewOpen, setWhatsNewOpen] = useState(false);
  const [whatsComingOpen, setWhatsComingOpen] = useState(false);

  const stats = useSWR("stats", fetchStats, {
    ...swrOpts,
    onSuccess: () => setLastUpdated(nowIST()),
  });
  const surges = useSWR("surges/active", fetchActiveSurges, swrOpts);
  const heatmap = useSWR("heatmap", fetchHeatmap, swrOpts);
  const history = useSWR("surges/history", () => fetchSurgeHistory(), swrOpts);

  // Set the initial clock on mount (avoids a server/client hydration mismatch).
  useEffect(() => {
    setLastUpdated(nowIST());
  }, []);

  // One-shot visitor beacon per tab session; the sessionStorage guard stops strict-mode
  // double-mounts and HMR from inflating the count.
  useEffect(() => {
    if (sessionStorage.getItem("tracked")) return;
    sessionStorage.setItem("tracked", "1");
    fetch("/api/track", { method: "POST", keepalive: true }).catch(() => {});
  }, []);

  // First-visit orientation. Runs client-side only (no SSR hydration mismatch) and is
  // wrapped in try/catch because localStorage throws in private/blocked-storage modes.
  useEffect(() => {
    try {
      if (!localStorage.getItem(INTRO_SEEN_KEY)) setWelcomeOpen(true);
    } catch {
      /* storage unavailable — just skip the intro */
    }
  }, []);

  const dismissWelcome = () => {
    try {
      localStorage.setItem(INTRO_SEEN_KEY, "1");
    } catch {
      /* ignore */
    }
    setWelcomeOpen(false);
  };

  const apiDown =
    !!stats.error && !!surges.error && !!heatmap.error && !!history.error;

  return (
    <>
      <main style={{ padding: "1rem 1.25rem 4rem", maxWidth: "100%" }}>
        <Header
          stats={stats.data ?? EMPTY_STATS}
          lastUpdated={lastUpdated}
          onWhatIs={() => setWelcomeOpen(true)}
          onTutorial={() => setTutorialOpen(true)}
          onWhatsNew={() => setWhatsNewOpen(true)}
          onWhatsComing={() => setWhatsComingOpen(true)}
          onFeedback={() => setFeedbackOpen(true)}
        />

        {apiDown && (
          <div
            style={{
              margin: "0.75rem 0",
              padding: "0.5rem 0.75rem",
              background: "#2a1d1d",
              border: "1px solid #5a2d2d",
              borderRadius: 6,
              color: "#FFB4B4",
              fontSize: "0.8rem",
            }}
          >
            ⚠ Live data unavailable — showing last cached data
          </div>
        )}

        <hr className="divider" />

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "7fr 3fr",
            gap: "1rem",
            alignItems: "start",
          }}
        >
          <SurgeMap heatmap={heatmap.data ?? []} surges={surges.data ?? []} />
          <SurgeFeed surges={surges.data ?? []} />
        </div>

        <hr className="divider" />

        <HistoryTable history={history.data ?? []} />

        <Footer
          onTutorial={() => setTutorialOpen(true)}
          onFeedback={() => setFeedbackOpen(true)}
        />
      </main>

      {/* Modals — rendered outside <main> so they overlay the whole page */}
      <WelcomeModal
        open={welcomeOpen}
        onClose={dismissWelcome}
        onTutorial={() => {
          dismissWelcome();
          setTutorialOpen(true);
        }}
      />
      <TutorialModal
        open={tutorialOpen}
        onClose={() => setTutorialOpen(false)}
        heatmapWindowHours={stats.data?.heatmap_window_hours ?? 1}
      />
      <ChangelogModal
        open={whatsNewOpen}
        onClose={() => setWhatsNewOpen(false)}
        title="What's New"
        items={stats.data?.whats_new ?? []}
        accent={ACCENT_NEW}
        emptyText="No updates to show right now — check back soon."
      />
      <ChangelogModal
        open={whatsComingOpen}
        onClose={() => setWhatsComingOpen(false)}
        title="What's Coming"
        items={stats.data?.whats_coming ?? []}
        accent={ACCENT_COMING}
        emptyText="Nothing on the public roadmap yet — check back soon."
      />
      <FeedbackModal open={feedbackOpen} onClose={() => setFeedbackOpen(false)} />
    </>
  );
}
