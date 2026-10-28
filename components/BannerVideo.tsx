"use client";

import { useEffect, useRef, useState } from "react";

const transparentPoster = "data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=";

export default function BannerVideo({ src, className = "", eager = false, onError }: { src: string; className?: string; eager?: boolean; onError?: () => void }) {
  const ref = useRef<HTMLVideoElement>(null);
  const [visible, setVisible] = useState(eager);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const video = ref.current;
    if (!video) return;
    if (eager || typeof IntersectionObserver === "undefined") { setVisible(true); return; }
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), { rootMargin: "120px" });
    observer.observe(video);
    return () => observer.disconnect();
  }, [eager]);

  useEffect(() => {
    const video = ref.current;
    if (!video) return;
    const updatePlayback = () => {
      if (!visible || document.hidden) video.pause();
      else void video.play().catch(() => undefined);
    };
    document.addEventListener("visibilitychange", updatePlayback);
    updatePlayback();
    return () => document.removeEventListener("visibilitychange", updatePlayback);
  }, [src, visible]);

  return <video ref={ref} className={`${className}${ready ? " is-ready" : ""}`} src={visible ? src : undefined} poster={transparentPoster} autoPlay muted loop playsInline preload={eager ? "metadata" : "none"} aria-hidden="true" onLoadedData={() => setReady(true)} onError={onError} />;
}
