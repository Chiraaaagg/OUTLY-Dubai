import Link from "next/link";
import { cn } from "@/lib/utils";

/**
 * OUTLY wordmark. The dot over the "U" is a sun — the single mark that carries
 * the brand across favicon, header and voucher.
 */
export function Logo({
  className,
  tone = "ink",
  href = "/",
}: {
  className?: string;
  tone?: "ink" | "white";
  href?: string | null;
}) {
  const mark = (
    <span className={cn("inline-flex items-baseline gap-1.5", className)}>
      <span
        className={cn(
          "font-display text-[1.4rem] font-extrabold leading-none tracking-tight",
          tone === "white" ? "text-white" : "text-ink-900",
        )}
      >
        OUT
        <span className="relative">
          L
          <span
            aria-hidden="true"
            className="absolute -top-1.5 left-1/2 h-1.5 w-1.5 -translate-x-1/2 rounded-full bg-sun-500"
          />
        </span>
        Y
      </span>
      <span className="sr-only">OUTLY — Dubai activities for Indian travellers</span>
    </span>
  );

  if (!href) return mark;
  return (
    <Link href={href} className="rounded focus-visible:outline-3 focus-visible:outline-offset-4">
      {mark}
    </Link>
  );
}

export function SunBurst({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden="true">
      <circle cx="32" cy="32" r="13" fill="currentColor" />
      {Array.from({ length: 12 }, (_, i) => {
        const a = (i * Math.PI) / 6;
        const x1 = 32 + Math.cos(a) * 19;
        const y1 = 32 + Math.sin(a) * 19;
        const x2 = 32 + Math.cos(a) * 27;
        const y2 = 32 + Math.sin(a) * 27;
        return (
          <line
            key={i}
            x1={x1}
            y1={y1}
            x2={x2}
            y2={y2}
            stroke="currentColor"
            strokeWidth="4"
            strokeLinecap="round"
          />
        );
      })}
    </svg>
  );
}
