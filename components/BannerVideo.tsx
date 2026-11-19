"use client";

import { useEffect, useRef, useState } from "react";

const transparentPoster = "data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=";

export default function BannerVideo({ src, className = "", eager = false, poster = transparentPoster, onError }: { src: string; className?: string; eager?: boolean; poster?: string; onError?: () => void }) {
  const ref = useRef<HTMLVideoElement>(null);
  const [visible, setVisible] = useState(eager);
  const [activated, setActivated] = useState(eager);
  const [pageReady, setPageReady] = useState(eager);
  const [motionPreference, setMotionPreference] = useState<"unknown" | "ok" | "reduce">("unknown");
  const [ready, setReady] = useState(false);

  useEffect(() => setReady(false), [src]);

  useEffect(() => {
    if (typeof window.matchMedia !== "function") { setMotionPreference("ok"); return; }
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setMotionPreference(query.matches ? "reduce" : "ok");
    update();
    query.addEventListener?.("change", update);
    return () => query.removeEventListener?.("change", update);
  }, []);

  useEffect(() => {
    if (eager || document.readyState === "complete") { setPageReady(true); return; }
    const readyPage = () => setPageReady(true);
    window.addEventListener("load", readyPage, { once: true });
    return () => window.removeEventListener("load", readyPage);
  }, [eager]);

  useEffect(() => {
    const video = ref.current;
    if (!video) return;
    if (eager || typeof IntersectionObserver === "undefined") { setVisible(true); setActivated(true); return; }
    const observer = new IntersectionObserver(([entry]) => {
      setVisible(entry.isIntersecting);
      if (entry.isIntersecting) setActivated(true);
    }, { rootMargin: "120px" });
    observer.observe(video);
    return () => observer.disconnect();
  }, [eager]);

  useEffect(() => {
    const video = ref.current;
    if (!video) return;
    const updatePlayback = () => {
      if (!visible || document.hidden || motionPreference === "reduce" || !pageReady) video.pause();
      else {
        video.muted = true;
        video.defaultMuted = true;
        void video.play().catch(() => undefined);
      }
    };
    document.addEventListener("visibilitychange", updatePlayback);
    updatePlayback();
    return () => document.removeEventListener("visibilitychange", updatePlayback);
  }, [src, visible, pageReady, motionPreference]);

  const attachSource = activated && pageReady && motionPreference !== "reduce";
  return <video ref={ref} className={`${className}${ready ? " is-ready" : ""}`} src={attachSource ? src : undefined} poster={poster} autoPlay muted loop playsInline preload={eager ? "metadata" : "none"} aria-hidden="true" onPlaying={() => setReady(true)} onError={onError} />;
}
