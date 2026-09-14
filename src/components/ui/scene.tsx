import { cn } from "@/lib/utils";

/**
 * Scene — OUTLY's illustrated media frame.
 *
 * Every activity image in this build is a deterministic SVG scene rather than a
 * photograph. Three reasons, in order of importance:
 *
 *  1. Performance. PRD §15 sets LCP < 2.5s at p75 on mobile 4G. A hero SVG is
 *     ~2KB inline and needs no network round trip, no CDN and no layout shift.
 *  2. It never breaks. No hotlinked stock photo 404ing in a demo.
 *  3. It's ours. Photography of Dubai looks identical on every competitor site;
 *     an illustrated system is the strongest single piece of brand distinction
 *     available before a photoshoot exists.
 *
 * Production swap: when `src` starts with "http", Scene renders next/image
 * instead. Real photography drops in per-SKU without touching any consumer.
 */

type Motif =
  | "skyline"
  | "dunes"
  | "waves"
  | "boat"
  | "splash"
  | "park"
  | "garden"
  | "dome"
  | "torus"
  | "frame"
  | "balloon"
  | "heli"
  | "camp"
  | "market";

interface SceneDef {
  motif: Motif;
  /** Sky gradient: [top, bottom] */
  sky: [string, string];
  /** Foreground silhouette colour */
  fg: string;
  /** Accent (sun, moon, lights) */
  accent: string;
  /** Mid layer */
  mid: string;
}

const SCENES: Record<string, SceneDef> = {
  "skyline-gold": { motif: "skyline", sky: ["#FFD79A", "#FF9A4D"], mid: "#FF7A2F", fg: "#5C2B12", accent: "#FFF3D6" },
  "skyline-night": { motif: "skyline", sky: ["#2B1F4A", "#0F0B1E"], mid: "#3E2C6B", fg: "#120D24", accent: "#FFC24B" },
  "dune-sunset": { motif: "dunes", sky: ["#FFC46B", "#FF6A3D"], mid: "#E4562A", fg: "#7A2E12", accent: "#FFF0C9" },
  "dune-calm": { motif: "dunes", sky: ["#FDE8C6", "#F6C98A"], mid: "#E7A867", fg: "#9A6234", accent: "#FFFDF5" },
  "camp-night": { motif: "camp", sky: ["#3A2559", "#150F2B"], mid: "#4B2F6E", fg: "#1B1233", accent: "#FFB43F" },
  "camp-luxe": { motif: "camp", sky: ["#2A2044", "#100C22"], mid: "#3B2C5C", fg: "#150F2B", accent: "#F3D9A4" },
  "camel-caravan": { motif: "dunes", sky: ["#FFB765", "#F2703C"], mid: "#D9522B", fg: "#6E2A12", accent: "#FFEEC4" },
  "quad-dust": { motif: "dunes", sky: ["#FFD79A", "#F58B4C"], mid: "#DE6A34", fg: "#7C3617", accent: "#FFF6E0" },
  "balloon-dawn": { motif: "balloon", sky: ["#FFD3C0", "#FF9A7A"], mid: "#E9744F", fg: "#8A3B25", accent: "#FFF6E8" },
  "marina-dusk": { motif: "waves", sky: ["#FFB27A", "#7B4CA8"], mid: "#3F2A6B", fg: "#141033", accent: "#FFD87A" },
  "dhow-lights": { motif: "boat", sky: ["#2E2258", "#120E28"], mid: "#00A6A0", fg: "#0C0A1E", accent: "#FFC24B" },
  "yacht-deck": { motif: "boat", sky: ["#8FE4DC", "#00A6A0"], mid: "#046E6A", fg: "#04302F", accent: "#FFF6E0" },
  "jetski-spray": { motif: "splash", sky: ["#9BE7E0", "#16B8AE"], mid: "#00807C", fg: "#03403E", accent: "#FFFFFF" },
  "water-splash": { motif: "splash", sky: ["#BDF0EA", "#4BCFC5"], mid: "#00A6A0", fg: "#065653", accent: "#FFFFFF" },
  "aquarium-blue": { motif: "waves", sky: ["#7FD6EE", "#1E7FA8"], mid: "#0C5C7E", fg: "#052F42", accent: "#C9F2EE" },
  "park-neon": { motif: "park", sky: ["#5B2A8C", "#241247"], mid: "#8B3FC9", fg: "#170B2E", accent: "#FF5FA2" },
  "aya-glow": { motif: "park", sky: ["#3D2A7A", "#150E33"], mid: "#6B3FD1", fg: "#0F0A26", accent: "#4BCFC5" },
  "stage-blue": { motif: "park", sky: ["#243B7A", "#0D1330"], mid: "#2F55B8", fg: "#080C1F", accent: "#FFC24B" },
  "night-market": { motif: "market", sky: ["#4A2A5E", "#1B1030"], mid: "#7A3F8C", fg: "#120A22", accent: "#FFB43F" },
  "garden-bloom": { motif: "garden", sky: ["#FFE3EF", "#FFB3C7"], mid: "#FF7FA2", fg: "#8A2E4C", accent: "#FFF7E4" },
  "frame-gold": { motif: "frame", sky: ["#FFE0A8", "#FFA24D"], mid: "#E9902F", fg: "#6E4212", accent: "#FFF6DF" },
  "museum-torus": { motif: "torus", sky: ["#DCE6F5", "#9FB6D8"], mid: "#6C86AE", fg: "#33415C", accent: "#FF6A13" },
  "mosque-white": { motif: "dome", sky: ["#DDE9F7", "#A9C4E4"], mid: "#7E9BC4", fg: "#3C4E6B", accent: "#FFF9F0" },
  "city-tour": { motif: "skyline", sky: ["#CFE6F7", "#8FBEDF"], mid: "#5C90BC", fg: "#28405C", accent: "#FF9A4D" },
  "family-day": { motif: "park", sky: ["#FFE9C4", "#FFC48F"], mid: "#FF9A5E", fg: "#8A4224", accent: "#00A6A0" },
  "luxury-night": { motif: "skyline", sky: ["#241B3A", "#0E0A1C"], mid: "#3A2C5E", fg: "#0B0817", accent: "#F3D9A4" },
  "heli-sky": { motif: "heli", sky: ["#BFDDF2", "#6FA8D6"], mid: "#3E76A8", fg: "#1D3A57", accent: "#FF6A13" },
};

const FALLBACK: SceneDef = SCENES["skyline-gold"];

function Motifs({ def }: { def: SceneDef }) {
  const { motif, fg, mid, accent } = def;

  switch (motif) {
    case "skyline":
      return (
        <>
          <circle cx="300" cy="86" r="34" fill={accent} opacity="0.9" />
          <path d="M0 168h400v92H0z" fill={mid} opacity="0.35" />
          <path
            d="M0 200h26v60H0zm34-34h22v94H34zm30 52h18v42H64zm26-96h16v138H90zm24 62h20v76h-20zm28-22h14v98h-14zm22-104h18v202h-18zm26 74h22v128h-22zm30-40h16v168h-16zm24 62h20v106h-20zm28-30h14v136h-14zm22 52h24v84h-24zm32-70h18v154h-18zm26 44h20v110h-20zm28 26h22v84h-22z"
            fill={fg}
          />
          <path d="M198 24l9 32h-18z" fill={fg} />
        </>
      );
    case "dunes":
      return (
        <>
          <circle cx="298" cy="96" r="40" fill={accent} opacity="0.92" />
          <path d="M0 172c60-30 104 10 158-4s96-46 152-26 90 14 90 14v104H0z" fill={mid} />
          <path d="M0 214c72-34 118 6 176-8s104-32 164-14 60 12 60 12v56H0z" fill={fg} opacity="0.88" />
        </>
      );
    case "camp":
      return (
        <>
          <circle cx="316" cy="66" r="22" fill={accent} opacity="0.85" />
          <circle cx="80" cy="52" r="2.5" fill={accent} />
          <circle cx="140" cy="34" r="2" fill={accent} />
          <circle cx="228" cy="44" r="2" fill={accent} />
          <circle cx="52" cy="96" r="2" fill={accent} />
          <path d="M0 196c80-26 130 8 210-6s190-22 190-22v92H0z" fill={mid} />
          <path d="M126 226l40-58 40 58z" fill={fg} />
          <path d="M212 226l30-44 30 44z" fill={fg} opacity="0.85" />
          <circle cx="96" cy="216" r="13" fill={accent} opacity="0.95" />
          <path d="M0 236h400v24H0z" fill={fg} />
        </>
      );
    case "waves":
      return (
        <>
          <circle cx="308" cy="74" r="30" fill={accent} opacity="0.9" />
          <path d="M0 150h400v110H0z" fill={mid} opacity="0.5" />
          <path
            d="M0 178h14v46H0zm22-30h12v76H22zm24 44h10v32H46zm22-60h14v92H68zm26 36h10v56H94zm22-72h12v128h-12zm24 52h14v76h-14zm26-30h10v106h-10zm22 44h12v62h-12zm26-70h10v132h-10zm22 50h14v82h-14zm26-26h10v108h-10zm24 40h12v68h-12zm26-58h10v126h-10z"
            fill={fg}
            opacity="0.9"
          />
          <path d="M0 232c40-14 62 12 100 0s62-14 100 0 62 12 100 0 60-10 100 0v28H0z" fill={accent} opacity="0.28" />
        </>
      );
    case "boat":
      return (
        <>
          <circle cx="312" cy="70" r="26" fill={accent} opacity="0.9" />
          <path d="M0 196h400v64H0z" fill={mid} opacity="0.55" />
          <path d="M118 196l14-58h124l16 58z" fill={fg} />
          <path d="M132 138h108l-8-34H140z" fill={fg} opacity="0.8" />
          <path d="M100 196h200l-22 34H122z" fill={fg} />
          <circle cx="150" cy="158" r="4" fill={accent} />
          <circle cx="200" cy="158" r="4" fill={accent} />
          <circle cx="250" cy="158" r="4" fill={accent} />
          <path d="M0 236c46-12 70 10 116 0s70-12 116 0 76 8 168-2v26H0z" fill={accent} opacity="0.22" />
        </>
      );
    case "splash":
      return (
        <>
          <circle cx="300" cy="72" r="30" fill={accent} opacity="0.65" />
          <path d="M0 170h400v90H0z" fill={mid} opacity="0.55" />
          <path d="M60 190c40-40 90-40 130 0s80 44 150 6" stroke={accent} strokeWidth="10" fill="none" strokeLinecap="round" opacity="0.8" />
          <path d="M40 226c50-30 100-24 140 4s110 24 180-8" stroke={fg} strokeWidth="12" fill="none" strokeLinecap="round" opacity="0.75" />
          <circle cx="120" cy="150" r="7" fill={accent} opacity="0.85" />
          <circle cx="252" cy="132" r="5" fill={accent} opacity="0.7" />
        </>
      );
    case "park":
      return (
        <>
          <circle cx="200" cy="118" r="58" fill={accent} opacity="0.22" />
          <circle cx="200" cy="118" r="38" fill={accent} opacity="0.35" />
          <path d="M200 62v112M144 118h112M160 78l80 80M240 78l-80 80" stroke={accent} strokeWidth="6" strokeLinecap="round" opacity="0.9" />
          <circle cx="200" cy="118" r="12" fill={accent} />
          <path d="M0 210h400v50H0z" fill={mid} opacity="0.6" />
          <path d="M0 232h400v28H0z" fill={fg} />
          <circle cx="70" cy="200" r="16" fill={accent} opacity="0.5" />
          <circle cx="330" cy="192" r="12" fill={accent} opacity="0.5" />
        </>
      );
    case "garden":
      return (
        <>
          <circle cx="310" cy="70" r="28" fill={accent} opacity="0.85" />
          <path d="M0 200h400v60H0z" fill={mid} opacity="0.5" />
          {[40, 96, 152, 208, 264, 320, 376].map((x, i) => (
            <g key={x}>
              <path d={`M${x} 236v-${30 + (i % 3) * 12}`} stroke={fg} strokeWidth="5" strokeLinecap="round" />
              <circle cx={x} cy={200 - (i % 3) * 12} r={13 - (i % 2) * 3} fill={fg} opacity="0.9" />
              <circle cx={x} cy={200 - (i % 3) * 12} r={5} fill={accent} />
            </g>
          ))}
          <path d="M0 236h400v24H0z" fill={fg} opacity="0.8" />
        </>
      );
    case "dome":
      return (
        <>
          <path d="M0 210h400v50H0z" fill={mid} opacity="0.45" />
          <path d="M160 210v-42a40 40 0 0180 0v42z" fill={fg} opacity="0.95" />
          <path d="M200 108c14 10 22 26 22 40h-44c0-14 8-30 22-40z" fill={fg} />
          <path d="M96 210v-30a28 28 0 0156 0v30zM248 210v-30a28 28 0 0156 0v30z" fill={fg} opacity="0.8" />
          <path d="M74 210v-70h8v70zm244 0v-70h8v70z" fill={fg} opacity="0.7" />
          <path d="M0 236h400v24H0z" fill={fg} opacity="0.85" />
          <path d="M0 214h400v18H0z" fill={accent} opacity="0.25" />
        </>
      );
    case "torus":
      return (
        <>
          <ellipse cx="200" cy="150" rx="118" ry="86" fill={fg} opacity="0.9" />
          <ellipse cx="200" cy="150" rx="52" ry="40" fill={mid} />
          <path
            d="M110 100c50 20 130 20 180 0M104 190c56-22 136-22 192 0"
            stroke={accent}
            strokeWidth="5"
            fill="none"
            opacity="0.65"
            strokeLinecap="round"
          />
          <path d="M0 236h400v24H0z" fill={fg} opacity="0.5" />
        </>
      );
    case "frame":
      return (
        <>
          <circle cx="316" cy="70" r="26" fill={accent} opacity="0.8" />
          <path d="M132 236V70h136v166h-28V98h-80v138z" fill={fg} />
          <path d="M160 98h80v20h-80z" fill={accent} opacity="0.5" />
          <path d="M0 236h400v24H0z" fill={mid} opacity="0.7" />
        </>
      );
    case "balloon":
      return (
        <>
          <path d="M200 46c34 0 60 28 60 62 0 30-38 62-60 62s-60-32-60-62c0-34 26-62 60-62z" fill={fg} />
          <path d="M200 46c14 0 22 28 22 62s-8 62-22 62-22-28-22-62 8-62 22-62z" fill={accent} opacity="0.55" />
          <path d="M186 170h28v6h-28z" fill={accent} />
          <path d="M190 176l-4 22h28l-4-22z" fill={fg} />
          <path d="M0 216c70-24 122 6 180-6s150-16 220-8v58H0z" fill={mid} opacity="0.8" />
        </>
      );
    case "heli":
      return (
        <>
          <path d="M120 214h96l40-30h-96z" fill={fg} />
          <path d="M216 184c26 0 44 8 60 22h-46z" fill={fg} opacity="0.85" />
          <path d="M60 176h240" stroke={fg} strokeWidth="7" strokeLinecap="round" />
          <path d="M172 176v10" stroke={fg} strokeWidth="6" />
          <path d="M126 226h96" stroke={fg} strokeWidth="6" strokeLinecap="round" />
          <circle cx="196" cy="200" r="9" fill={accent} />
          <path d="M0 244h400v16H0z" fill={mid} opacity="0.55" />
        </>
      );
    case "market":
      return (
        <>
          {[36, 108, 180, 252, 324].map((x, i) => (
            <g key={x}>
              <path d={`M${x - 30} 168h60l-8 68h-44z`} fill={fg} opacity={0.9 - i * 0.05} />
              <path d={`M${x - 34} 168l14-24h40l14 24z`} fill={accent} opacity="0.7" />
            </g>
          ))}
          <path d="M0 236h400v24H0z" fill={mid} opacity="0.8" />
          {[60, 130, 200, 270, 340].map((x) => (
            <circle key={x} cx={x} cy={132} r="4" fill={accent} />
          ))}
        </>
      );
    default:
      return null;
  }
}

export interface SceneProps {
  /** Scene key from the catalogue, or an http(s) URL for real photography. */
  src: string;
  alt: string;
  className?: string;
  /** Renders a soft dark scrim so overlaid text stays readable. */
  scrim?: boolean;
  priority?: boolean;
}

export function Scene({ src, alt, className, scrim, priority }: SceneProps) {
  if (src.startsWith("http")) {
    // eslint-disable-next-line @next/next/no-img-element
    return (
      <img
        src={src}
        alt={alt}
        loading={priority ? "eager" : "lazy"}
        decoding="async"
        className={cn("h-full w-full object-cover", className)}
      />
    );
  }

  const def = SCENES[src] ?? FALLBACK;
  const id = src.replace(/[^a-z0-9]/gi, "");

  return (
    <svg
      viewBox="0 0 400 260"
      preserveAspectRatio="xMidYMid slice"
      role="img"
      aria-label={alt}
      className={cn("h-full w-full", className)}
    >
      <defs>
        <linearGradient id={`sky-${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={def.sky[0]} />
          <stop offset="100%" stopColor={def.sky[1]} />
        </linearGradient>
        {scrim && (
          <linearGradient id={`scrim-${id}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="35%" stopColor="#14101f" stopOpacity="0" />
            <stop offset="100%" stopColor="#14101f" stopOpacity="0.72" />
          </linearGradient>
        )}
      </defs>
      <rect width="400" height="260" fill={`url(#sky-${id})`} />
      <Motifs def={def} />
      {scrim && <rect width="400" height="260" fill={`url(#scrim-${id})`} />}
    </svg>
  );
}

export const sceneKeys = Object.keys(SCENES);
