"use client";

import { useState } from "react";
import { Expand, Play, X } from "lucide-react";
import { Scene } from "@/components/ui/scene";
import { cn } from "@/lib/utils";

/**
 * ADP gallery.
 *
 * Mobile: a swipeable snap rail with a counter — no thumbnails, no arrows,
 * because on a 360px screen the image is the page and chrome steals from it.
 * Desktop: a 2×2 mosaic with the hero at 2× and a "view all" affordance.
 * Lightbox is keyboard-navigable (arrows + Escape).
 */
export function Gallery({
  images,
  alt,
  video,
  badge,
}: {
  images: string[];
  alt: string;
  video?: string;
  badge?: React.ReactNode;
}) {
  const [index, setIndex] = useState(0);
  const [lightbox, setLightbox] = useState(false);
  const shots = images.length >= 3 ? images : [...images, ...images, ...images].slice(0, 3);

  return (
    <>
      {/* Mobile */}
      <div className="relative sm:hidden">
        <div
          className="rail -mx-4"
          onScroll={(e) => {
            const el = e.currentTarget;
            setIndex(Math.round(el.scrollLeft / el.clientWidth));
          }}
          aria-label={`${alt} — photo gallery`}
        >
          {shots.map((src, i) => (
            <div key={`${src}-${i}`} className="rail-item aspect-[4/3] w-screen">
              <Scene src={src} alt={i === 0 ? alt : `${alt} (${i + 1})`} priority={i === 0} />
            </div>
          ))}
        </div>
        {badge && <div className="absolute left-3 top-3">{badge}</div>}
        <p className="absolute bottom-3 right-3 rounded-full bg-ink-900/75 px-2.5 py-1 text-2xs font-bold text-white tnum">
          {index + 1} / {shots.length}
        </p>
      </div>

      {/* Desktop mosaic. Two details worth keeping:
          1. Height lives on the grid, not as an aspect ratio on the hero — a
             `row-span-2` cell with its own aspect ratio fights implicit row
             sizing and produces uneven tiles.
          2. Column count follows the number of secondary shots, so a SKU with
             three photos gets a filled 3-column mosaic rather than a 4-column
             one with a hole in it. */}
      <div
        className={cn(
          "relative hidden h-[22rem] gap-2 sm:grid sm:grid-rows-2 lg:h-[27rem]",
          shots.length >= 5 ? "sm:grid-cols-4" : "sm:grid-cols-3",
        )}
      >
        <button
          type="button"
          onClick={() => {
            setIndex(0);
            setLightbox(true);
          }}
          className="relative col-span-2 row-span-2 h-full overflow-hidden rounded-l-[var(--radius-tile)]"
        >
          <Scene src={shots[0]} alt={alt} priority />
          {video && (
            <span className="absolute inset-0 flex items-center justify-center">
              <span className="flex h-14 w-14 items-center justify-center rounded-full bg-white/90 text-ink-900">
                <Play className="ml-0.5 h-6 w-6 fill-current" />
              </span>
            </span>
          )}
        </button>
        {shots.slice(1, 5).map((src, i) => (
          <button
            key={`${src}-${i}`}
            type="button"
            onClick={() => {
              setIndex(i + 1);
              setLightbox(true);
            }}
            className={cn(
              "relative h-full overflow-hidden",
              i === 0 && "rounded-tr-[var(--radius-tile)]",
              i === shots.slice(1, 5).length - 1 && "rounded-br-[var(--radius-tile)]",
            )}
          >
            <Scene src={src} alt={`${alt} (${i + 2})`} />
          </button>
        ))}
        {badge && <div className="absolute left-4 top-4">{badge}</div>}
        <button
          type="button"
          onClick={() => setLightbox(true)}
          className="absolute bottom-4 right-4 flex items-center gap-1.5 rounded-full bg-paper px-3.5 py-2 text-sm font-bold text-ink-900 shadow-[var(--shadow-lift)]"
        >
          <Expand className="h-4 w-4" />
          View all {shots.length}
        </button>
      </div>

      {lightbox && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`${alt} gallery`}
          className="fixed inset-0 z-[90] flex flex-col bg-ink-900/95"
          onKeyDown={(e) => {
            if (e.key === "Escape") setLightbox(false);
            if (e.key === "ArrowRight") setIndex((i) => (i + 1) % shots.length);
            if (e.key === "ArrowLeft") setIndex((i) => (i - 1 + shots.length) % shots.length);
          }}
          tabIndex={-1}
          ref={(el) => el?.focus()}
        >
          <div className="flex items-center justify-between p-4 text-white">
            <p className="text-sm font-bold tnum">
              {index + 1} / {shots.length}
            </p>
            <button
              type="button"
              onClick={() => setLightbox(false)}
              className="flex h-11 w-11 items-center justify-center rounded-full hover:bg-white/10"
            >
              <X className="h-6 w-6" />
              <span className="sr-only">Close gallery</span>
            </button>
          </div>
          <div className="flex flex-1 items-center justify-center p-4">
            <div className="aspect-[4/3] w-full max-w-4xl overflow-hidden rounded-[var(--radius-tile)]">
              <Scene src={shots[index]} alt={`${alt} (${index + 1})`} />
            </div>
          </div>
          <div className="flex gap-2 overflow-x-auto p-4">
            {shots.map((src, i) => (
              <button
                key={`${src}-thumb-${i}`}
                type="button"
                onClick={() => setIndex(i)}
                className={cn(
                  "h-16 w-24 shrink-0 overflow-hidden rounded-lg border-2",
                  i === index ? "border-white" : "border-transparent opacity-60",
                )}
              >
                <Scene src={src} alt="" />
              </button>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
