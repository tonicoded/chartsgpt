"use client";

import { useEffect } from "react";

const FRAME_COUNT = 73;
const FRAME_INTERVAL_MS = 1000 / 6;

function frameSource(index: number) {
  return `/gotem-assets/gameplay-frames/frame-${String(index).padStart(3, "0")}.jpg`;
}

export default function GotemGameplay() {
  useEffect(() => {
    const gameplay = document.querySelector<HTMLImageElement>("[data-gotem-gameplay]");
    if (!gameplay) return;

    const frames = Array.from({ length: FRAME_COUNT }, (_, index) => frameSource(index + 1));
    const preloadedFrames = frames.slice(1).map((src) => {
      const image = new Image();
      image.src = src;
      return image;
    });

    let frameIndex = 0;
    const timer = window.setInterval(() => {
      frameIndex = (frameIndex + 1) % frames.length;
      gameplay.src = frames[frameIndex];
    }, FRAME_INTERVAL_MS);

    return () => {
      window.clearInterval(timer);
      preloadedFrames.forEach((image) => {
        image.src = "";
      });
    };
  }, []);

  return null;
}
