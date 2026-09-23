import Link from "next/link";
import { cn } from "@/lib/utils";

/**
 * OUTLYY logo — outlined SVG (Route A, "break-out O").
 * Generated from brand/01-logo/svg/outlyy-logo-primary.svg. Do not hand-edit the
 * path data: regenerate from the brand pack. Text is outlined, so it renders the
 * same without Bricolage loaded (email, PDF, first paint).
 *
 * Tones: "ink" (default, on Sand/Paper) · "white" (on Ink / photos) · "onSun".
 * Height drives size; width follows the 4.818:1 aspect.
 */
const WORDMARK_VIEWBOX = "0.0 -722.0 3546.1 736.0";
const RING = "M688 -330A344 344 0 1 1 344 -674A78 78 0 0 1 344 -518A188 188 0 1 0 532 -330A78 78 0 0 1 688 -330Z";
const LETTERS = "M1078.29 14Q1017 14 969.14 1.36Q921.29 -11.29 886.29 -35.29Q851.29 -59.29 828.36 -93.14Q805.43 -127 794.21 -169.36Q783 -211.71 783 -261.43V-660H945V-267.29Q945 -218.43 960 -187.57Q975 -156.71 1004.43 -142.64Q1033.86 -128.57 1077.57 -128.57Q1122.29 -128.57 1151.71 -142.64Q1181.14 -156.71 1196.14 -187.43Q1211.14 -218.14 1211.14 -267.29V-660H1372.43V-261.43Q1372.43 -130.71 1299.21 -58.36Q1226 14 1078.29 14Z M1595.14 0V-660H1757.14V0ZM1410.71 -524.86V-660H1942.29V-524.86Z M1983.71 0V-660H2145V0ZM2012.43 0V-135.86H2408.86V0Z M2521.29 0V-207.86L2282.71 -660H2476.14L2600.14 -352.43H2605L2728.71 -660H2920.14L2683.29 -209.29V0Z M3147.29 0V-207.86L2908.71 -660H3102.14L3226.14 -352.43H3231L3354.71 -660H3546.14L3309.29 -209.29V0Z";
const MARK_RING = "M54 34A24 24 0 1 1 30 10A5 5 0 0 1 30 20A14 14 0 1 0 44 34A5 5 0 0 1 54 34Z";

const TONES = {
  ink: { ring: "#14101F", sun: "#FF6A13", text: "#14101F" },
  white: { ring: "#FFFFFF", sun: "#FF6A13", text: "#FFFFFF" },
  onSun: { ring: "#14101F", sun: "#FFFFFF", text: "#14101F" },
} as const;

type Tone = keyof typeof TONES;

export function Wordmark({ tone = "ink", className }: { tone?: Tone; className?: string }) {
  const c = TONES[tone];
  return (
    <svg viewBox={WORDMARK_VIEWBOX} className={cn("h-7 w-auto", className)} aria-hidden="true" focusable="false">
      <path fill={c.ring} d={RING} />
      <circle className="outlyy-sun" fill={c.sun} cx={610} cy={-596} r={126} />
      <path fill={c.text} d={LETTERS} />
    </svg>
  );
}

/** The logomark alone — favicon/app-icon shape. 64-unit grid. */
export function BrandMark({ tone = "ink", className }: { tone?: Tone; className?: string }) {
  const c = TONES[tone];
  return (
    <svg viewBox="0 0 64 64" className={cn("h-8 w-8", className)} aria-hidden="true" focusable="false">
      <path fill={c.ring} d={MARK_RING} />
      <circle className="outlyy-sun" fill={c.sun} cx={49} cy={15} r={9} />
    </svg>
  );
}

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
    <span className={cn("group/logo inline-flex items-center", className)}>
      <Wordmark tone={tone} className="h-7 w-auto" />
      <span className="sr-only">OUTLYY — Dubai activities for Indian travellers</span>
    </span>
  );
  if (!href) return mark;
  return (
    <Link href={href} className="rounded focus-visible:outline-3 focus-visible:outline-offset-4">
      {mark}
    </Link>
  );
}
