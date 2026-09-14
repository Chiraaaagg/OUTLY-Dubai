"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { track } from "@/lib/analytics";
import type { CartItem, Currency } from "@/lib/types";
import { PRICE_LOCK_MINUTES } from "@/lib/pricing";

/**
 * Client-side application state: currency, cart (trip builder), wishlist,
 * compare tray and toasts.
 *
 * Persistence is localStorage for this build. In production the cart is a
 * server-side object keyed to the session so it survives across devices for
 * logged-in users (AC-CART-03) — the shape here is deliberately the same.
 */

const KEYS = {
  cart: "outly.cart.v1",
  wishlist: "outly.wishlist.v1",
  compare: "outly.compare.v1",
  currency: "outly.currency.v1",
  lock: "outly.pricelock.v1",
};

export interface Toast {
  id: string;
  title: string;
  body?: string;
  tone: "success" | "error" | "info";
  action?: { label: string; href: string };
}

interface AppState {
  hydrated: boolean;

  currency: Currency;
  setCurrency: (c: Currency) => void;
  /** True when the visitor is (mock-)geolocated in the UAE — expat defaults. */
  inUAE: boolean;

  cart: CartItem[];
  addToCart: (item: CartItem) => void;
  removeFromCart: (id: string) => void;
  updateCartItem: (id: string, patch: Partial<CartItem>) => void;
  clearCart: () => void;
  cartTotalINR: number;
  cartTotalAED: number;
  /** Minutes remaining on the 20-minute price lock, or null when cart is empty. */
  priceLockMinutes: number | null;

  wishlist: string[];
  toggleWishlist: (slug: string) => void;
  isSaved: (slug: string) => boolean;

  compare: string[];
  toggleCompare: (slug: string) => boolean;
  clearCompare: () => void;

  toasts: Toast[];
  toast: (t: Omit<Toast, "id">) => void;
  dismissToast: (id: string) => void;
}

const Ctx = createContext<AppState | null>(null);

function read<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* private mode — state stays in memory for this session */
  }
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [hydrated, setHydrated] = useState(false);
  const [currency, setCurrencyState] = useState<Currency>("INR");
  const [inUAE, setInUAE] = useState(false);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [wishlist, setWishlist] = useState<string[]>([]);
  const [compare, setCompare] = useState<string[]>([]);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [lockStartedAt, setLockStartedAt] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());

  // Hydrate once on the client. Rendering identical markup on the server and
  // the first client pass avoids a hydration mismatch on cart/wishlist counts.
  useEffect(() => {
    setCart(read<CartItem[]>(KEYS.cart, []));
    setWishlist(read<string[]>(KEYS.wishlist, []));
    setCompare(read<string[]>(KEYS.compare, []));
    setLockStartedAt(read<number | null>(KEYS.lock, null));

    const stored = read<Currency | null>(KEYS.currency, null);
    // MOCK geo-detection (PRD REQ: UAE visitors see AED and today/tomorrow
    // defaults). Real implementation reads an edge geo header.
    const uae =
      typeof Intl !== "undefined" &&
      Intl.DateTimeFormat().resolvedOptions().timeZone === "Asia/Dubai";
    setInUAE(uae);
    setCurrencyState(stored ?? (uae ? "AED" : "INR"));
    setHydrated(true);
  }, []);

  // Price-lock ticker. Only runs while a cart exists.
  useEffect(() => {
    if (!lockStartedAt || cart.length === 0) return;
    const t = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(t);
  }, [lockStartedAt, cart.length]);

  const setCurrency = useCallback((c: Currency) => {
    setCurrencyState(c);
    write(KEYS.currency, c);
    track("filter_applied", { filters: `currency:${c}` });
  }, []);

  const toast = useCallback((t: Omit<Toast, "id">) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    setToasts((prev) => [...prev, { ...t, id }]);
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((x) => x.id !== id));
    }, 6000);
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const addToCart = useCallback(
    (item: CartItem) => {
      setCart((prev) => {
        const next = prev.some((i) => i.id === item.id)
          ? prev.map((i) => (i.id === item.id ? item : i))
          : [...prev, item];
        write(KEYS.cart, next);
        return next;
      });
      setLockStartedAt((prev) => {
        const started = prev ?? Date.now();
        write(KEYS.lock, started);
        return started;
      });
      track("add_to_cart", {
        activity_slug: item.slug,
        value: item.total.inr,
        currency: "INR",
        selected_date: item.date,
        guest_count: item.pax.adult + item.pax.child + item.pax.infant + item.pax.senior,
      });
    },
    [],
  );

  const removeFromCart = useCallback((id: string) => {
    setCart((prev) => {
      const next = prev.filter((i) => i.id !== id);
      write(KEYS.cart, next);
      if (next.length === 0) {
        write(KEYS.lock, null);
      }
      return next;
    });
  }, []);

  const updateCartItem = useCallback((id: string, patch: Partial<CartItem>) => {
    setCart((prev) => {
      const next = prev.map((i) => (i.id === id ? { ...i, ...patch } : i));
      write(KEYS.cart, next);
      return next;
    });
  }, []);

  const clearCart = useCallback(() => {
    setCart([]);
    write(KEYS.cart, []);
    write(KEYS.lock, null);
    setLockStartedAt(null);
  }, []);

  const toggleWishlist = useCallback(
    (slug: string) => {
      setWishlist((prev) => {
        const saved = prev.includes(slug);
        const next = saved ? prev.filter((s) => s !== slug) : [...prev, slug];
        write(KEYS.wishlist, next);
        if (!saved) track("activity_saved", { activity_slug: slug });
        return next;
      });
    },
    [],
  );

  const toggleCompare = useCallback(
    (slug: string) => {
      let added = false;
      setCompare((prev) => {
        if (prev.includes(slug)) {
          const next = prev.filter((s) => s !== slug);
          write(KEYS.compare, next);
          return next;
        }
        if (prev.length >= 3) {
          toast({
            tone: "info",
            title: "Compare holds three at a time",
            body: "Remove one to add another.",
          });
          return prev;
        }
        added = true;
        const next = [...prev, slug];
        write(KEYS.compare, next);
        track("activity_compared", { activity_slug: slug, result_count: next.length });
        return next;
      });
      return added;
    },
    [toast],
  );

  const clearCompare = useCallback(() => {
    setCompare([]);
    write(KEYS.compare, []);
  }, []);

  const cartTotalINR = useMemo(() => cart.reduce((s, i) => s + i.total.inr, 0), [cart]);
  const cartTotalAED = useMemo(() => cart.reduce((s, i) => s + i.total.aed, 0), [cart]);

  const priceLockMinutes = useMemo(() => {
    if (!lockStartedAt || cart.length === 0) return null;
    const elapsed = Math.floor((now - lockStartedAt) / 60000);
    return Math.max(0, PRICE_LOCK_MINUTES - elapsed);
  }, [lockStartedAt, cart.length, now]);

  const value: AppState = {
    hydrated,
    currency,
    setCurrency,
    inUAE,
    cart,
    addToCart,
    removeFromCart,
    updateCartItem,
    clearCart,
    cartTotalINR,
    cartTotalAED,
    priceLockMinutes,
    wishlist,
    toggleWishlist,
    isSaved: (slug) => wishlist.includes(slug),
    compare,
    toggleCompare,
    clearCompare,
    toasts,
    toast,
    dismissToast,
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useApp(): AppState {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useApp must be used inside <AppProvider>");
  return ctx;
}
