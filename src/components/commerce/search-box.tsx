"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Clock3, Search, TrendingUp, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DateField, DatePickerSheet, GuestField, GuestSheet } from "./pickers";
import { track } from "@/lib/analytics";
import { POPULAR_SEARCHES, suggest, type Suggestion } from "@/lib/search";
import { useSlimCatalog } from "@/lib/catalog/client";
import type { PaxCount } from "@/lib/types";
import { EMPTY_PAX, cn, paxTotal, toDateKey } from "@/lib/utils";

const RECENT_KEY = "outlyy.recent-searches.v1";

function readRecent(): string[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(window.localStorage.getItem(RECENT_KEY) ?? "[]") as string[];
  } catch {
    return [];
  }
}

function pushRecent(q: string) {
  if (!q.trim()) return;
  const next = [q, ...readRecent().filter((r) => r !== q)].slice(0, 5);
  try {
    window.localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
}

/* ---------------------------------------------------------------------------
 * Header search — combobox with suggestions, recent and popular searches
 * ------------------------------------------------------------------------ */

export function HeaderSearch({ className }: { className?: string }) {
  const router = useRouter();
  const { activities: catalogue } = useSlimCatalog();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [recent, setRecent] = useState<string[]>([]);
  const [active, setActive] = useState(-1);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => setRecent(readRecent()), []);

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  const suggestions: Suggestion[] = q.trim() ? suggest(q, 7, catalogue) : POPULAR_SEARCHES;

  const submit = (value = q) => {
    if (!value.trim()) return;
    pushRecent(value);
    setRecent(readRecent());
    setOpen(false);
    track("search_submitted", { filters: value, result_count: suggest(value, 7, catalogue).length });
    router.push(`/search?q=${encodeURIComponent(value)}`);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, suggestions.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, -1));
    } else if (e.key === "Enter") {
      if (active >= 0 && suggestions[active]) {
        e.preventDefault();
        track("search_suggestion_selected", { filters: suggestions[active].label });
        router.push(suggestions[active].href);
        setOpen(false);
      } else {
        submit();
      }
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  return (
    <div ref={wrapRef} className={cn("relative", className)}>
      <div className="flex items-center gap-2 rounded-full border border-ink-200 bg-paper px-3.5 shadow-[var(--shadow-soft)] focus-within:border-ink-900">
        <Search className="h-[1.15rem] w-[1.15rem] shrink-0 text-ink-400" aria-hidden="true" />
        <input
          type="search"
          role="combobox"
          aria-expanded={open}
          aria-controls="header-search-listbox"
          aria-autocomplete="list"
          aria-label="Search Dubai experiences"
          placeholder="Desert safari, Burj Khalifa, dhow cruise…"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
            setActive(-1);
          }}
          onFocus={() => {
            setOpen(true);
            track("search_started", { page_type: "header" });
          }}
          onKeyDown={onKeyDown}
          className="min-h-11 w-full bg-transparent text-[0.95rem] outline-none placeholder:text-ink-400"
        />
        {q && (
          <button
            type="button"
            onClick={() => {
              setQ("");
              setActive(-1);
            }}
            aria-label="Clear search"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-ink-500 hover:bg-ink-100"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {open && (
        <div
          id="header-search-listbox"
          role="listbox"
          className="absolute inset-x-0 top-[calc(100%+0.5rem)] z-50 max-h-[70vh] overflow-y-auto rounded-[var(--radius-card)] border border-ink-200 bg-paper p-2 shadow-[var(--shadow-pop)]"
        >
          {!q.trim() && recent.length > 0 && (
            <Group label="Recent searches" icon={<Clock3 className="h-3.5 w-3.5" />}>
              {recent.map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => submit(r)}
                  className="block w-full rounded-lg px-3 py-2.5 text-left text-sm font-medium text-ink-800 hover:bg-shell"
                >
                  {r}
                </button>
              ))}
            </Group>
          )}

          <Group
            label={q.trim() ? "Experiences" : "Popular right now"}
            icon={<TrendingUp className="h-3.5 w-3.5" />}
          >
            {suggestions.length === 0 && (
              <p className="px-3 py-4 text-sm text-ink-500">
                Nothing matches “{q}”. Try “desert safari”, “Burj Khalifa” or{" "}
                <Link href="/search" className="font-bold text-sun-700 underline">
                  browse everything
                </Link>
                .
              </p>
            )}
            {suggestions.map((s, i) => (
              <Link
                key={s.href + s.label}
                href={s.href}
                role="option"
                aria-selected={i === active}
                onClick={() => {
                  track("search_suggestion_selected", { filters: s.label, position: i });
                  setOpen(false);
                }}
                className={cn(
                  "flex items-center justify-between gap-3 rounded-lg px-3 py-2.5 text-sm hover:bg-shell",
                  i === active && "bg-shell",
                )}
              >
                <span className="min-w-0 font-semibold text-ink-900">{s.label}</span>
                <span className="shrink-0 text-xs text-ink-500">{s.sub}</span>
              </Link>
            ))}
          </Group>
        </div>
      )}
    </div>
  );
}

function Group({
  label,
  icon,
  children,
}: {
  label: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-1 last:mb-0">
      <p className="flex items-center gap-1.5 px-3 py-1.5 text-2xs font-extrabold uppercase tracking-[0.12em] text-ink-400">
        {icon}
        {label}
      </p>
      {children}
    </div>
  );
}

/* ---------------------------------------------------------------------------
 * Hero search — destination is fixed (Dubai), so date + guests are the
 * primary inputs rather than a text box (PRD §5.1 above-the-fold spec).
 * ------------------------------------------------------------------------ */

export function HeroSearch({ className }: { className?: string }) {
  const router = useRouter();
  const [date, setDate] = useState(() => toDateKey(new Date()));
  const [pax, setPax] = useState<PaxCount>(EMPTY_PAX);
  const [dateOpen, setDateOpen] = useState(false);
  const [guestOpen, setGuestOpen] = useState(false);

  const go = () => {
    const params = new URLSearchParams({
      date,
      adults: String(pax.adult),
      children: String(pax.child),
      infants: String(pax.infant),
      seniors: String(pax.senior),
    });
    track("search_submitted", {
      page_type: "hero",
      selected_date: date,
      guest_count: paxTotal(pax),
    });
    router.push(`/search?${params.toString()}`);
  };

  return (
    <div
      className={cn(
        "rounded-[var(--radius-tile)] border border-ink-200 bg-paper/95 p-2.5 shadow-[var(--shadow-lift)] backdrop-blur",
        className,
      )}
    >
      <div className="grid grid-safe gap-2 sm:grid-cols-[1.1fr_1.3fr_auto]">
        <DateField value={date} onClick={() => setDateOpen(true)} label="When" />
        <GuestField value={pax} onClick={() => setGuestOpen(true)} />
        <Button size="lg" onClick={go} className="sm:min-w-[9rem]">
          <Search className="h-[1.15rem] w-[1.15rem]" />
          Find things to do
        </Button>
      </div>

      <DatePickerSheet
        open={dateOpen}
        onClose={() => setDateOpen(false)}
        value={date}
        onChange={setDate}
      />
      <GuestSheet
        open={guestOpen}
        onClose={() => setGuestOpen(false)}
        value={pax}
        onChange={setPax}
      />
    </div>
  );
}
