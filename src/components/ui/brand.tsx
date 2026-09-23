import { cn } from "@/lib/utils";

/**
 * Brand furniture from the OUTLYY asset pack that needs to be a component
 * rather than a static file: the agent avatar frame (it wraps live content)
 * and the loader (its animation must survive `prefers-reduced-motion`, which
 * an `<img>`-loaded SVG does not reliably honour in every browser — see the
 * brand book's export checklist).
 *
 * Geometry comes straight from `brand/12-agent-avatar` and `brand/13-loader`.
 * Do not adjust it by eye: regenerate from the pack.
 */

/* ------------------------------------------------------------ agent frame */

/** Open ring + status sun, on the brand's 112-unit grid. */
const FRAME_RING =
  "M105.5 58A49.5 49.5 0 1 1 56 8.5A2.5 2.5 0 0 1 56 13.5A44.5 44.5 0 1 0 100.5 58A2.5 2.5 0 0 1 105.5 58Z";

/** Sun is the online dot; Ink-400 when the agent is away. */
const STATUS_FILL = { online: "#FF6A13", away: "#A79EB8" } as const;

export type AgentStatus = keyof typeof STATUS_FILL;

/**
 * Wraps a photo or initials in the brand frame. The inner circle is 71% of the
 * frame and sits 2% below centre, exactly as the asset book specifies, so the
 * open top-right of the ring stays clear of the face.
 */
export function AgentFrame({
  children,
  status = "online",
  size = 56,
  className,
  title,
}: {
  children: React.ReactNode;
  status?: AgentStatus;
  /** Rendered pixel size of the whole frame. */
  size?: number;
  className?: string;
  title?: string;
}) {
  return (
    <span
      className={cn("relative inline-block shrink-0 align-middle", className)}
      style={{ width: size, height: size }}
      title={title}
    >
      <span
        className="absolute left-1/2 top-[52%] flex -translate-x-1/2 -translate-y-1/2 items-center justify-center overflow-hidden rounded-full"
        style={{ width: `${(80 / 112) * 100}%`, height: `${(80 / 112) * 100}%` }}
      >
        {children}
      </span>
      <svg viewBox="0 0 112 112" className="absolute inset-0 h-full w-full" aria-hidden="true" focusable="false">
        <path fill="currentColor" d={FRAME_RING} />
        <circle cx="89.2" cy="24.8" r="10.5" fill={STATUS_FILL[status]} stroke="#FFF8F0" strokeWidth="3" />
      </svg>
    </span>
  );
}

/* ----------------------------------------------------------------- loader */

/**
 * Full-page / section loader: the ring draws on and the sun pops out.
 * Inline so the reduced-motion query is guaranteed to apply; under it the mark
 * stops drawing and the sun pulses opacity instead.
 *
 * Use for waits over ~400ms. Lists keep their skeleton shimmer.
 */
export function BrandLoader({
  size = 48,
  tone = "ink",
  label = "Loading",
  className,
}: {
  size?: number;
  tone?: "ink" | "white";
  label?: string;
  className?: string;
}) {
  const ring = tone === "white" ? "#FFFFFF" : "#14101F";
  return (
    <span className={cn("inline-flex items-center justify-center", className)} role="status" aria-live="polite">
      <svg viewBox="0 0 64 64" width={size} height={size} aria-hidden="true" focusable="false">
        <style>{`
          .outlyy-loader-ring{fill:none;stroke:${ring};stroke-width:10;stroke-linecap:round;stroke-dasharray:90;stroke-dashoffset:90;animation:outlyy-draw 1.4s cubic-bezier(.22,1,.36,1) infinite}
          .outlyy-loader-sun{fill:#FF6A13;transform-origin:49px 15px;transform:scale(0);animation:outlyy-pop 1.4s cubic-bezier(.34,1.56,.64,1) infinite}
          @keyframes outlyy-draw{0%{stroke-dashoffset:90}55%,100%{stroke-dashoffset:0}}
          @keyframes outlyy-pop{0%,50%{transform:scale(0)}70%{transform:scale(1.18)}85%,100%{transform:scale(1)}}
          @media (prefers-reduced-motion:reduce){
            .outlyy-loader-ring{animation:none;stroke-dashoffset:0}
            .outlyy-loader-sun{animation:outlyy-pulse 1.6s ease-in-out infinite;transform:none}
          }
          @keyframes outlyy-pulse{0%,100%{opacity:1}50%{opacity:.45}}
        `}</style>
        <path className="outlyy-loader-ring" d="M49 34A19 19 0 1 1 30 15" />
        <circle className="outlyy-loader-sun" cx="49" cy="15" r="9" />
      </svg>
      <span className="sr-only">{label}</span>
    </span>
  );
}
