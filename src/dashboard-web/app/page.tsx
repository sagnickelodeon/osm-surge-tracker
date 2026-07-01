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
import { REFRESH_INTERVAL_MS } from "@/lib/config";
import { nowIST } from "@/lib/time";
import Header from "@/components/Header";
import SurgeFeed from "@/components/SurgeFeed";
import HistoryTable from "@/components/HistoryTable";
import Footer from "@/components/Footer";
import TutorialModal from "@/components/TutorialModal";
import FeedbackModal from "@/components/FeedbackModal";

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

  const apiDown =
    !!stats.error && !!surges.error && !!heatmap.error && !!history.error;

  return (
    <>
      <main style={{ padding: "1rem 1.25rem 4rem", maxWidth: "100%" }}>
        <Header
          stats={stats.data ?? EMPTY_STATS}
          lastUpdated={lastUpdated}
          onTutorial={() => setTutorialOpen(true)}
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
      <TutorialModal open={tutorialOpen} onClose={() => setTutorialOpen(false)} />
      <FeedbackModal open={feedbackOpen} onClose={() => setFeedbackOpen(false)} />
    </>
  );
}
