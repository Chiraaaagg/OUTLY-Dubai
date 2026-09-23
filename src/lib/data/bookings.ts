import type { Booking } from "../types";

/**
 * Bookings are served from the database (`/api/me/orders`, the agent console
 * and `orderService`), not from here.
 *
 * This file used to hold four fabricated confirmed bookings — named
 * travellers, hotel pickups, a supplier contact at "Rayna Tourism" — which
 * Next prerendered into real, reachable URLs: `/voucher/OUT-482913`,
 * `/booking/OUT-517204` and so on. Anyone who guessed or was sent one of
 * those links saw what looked like a genuine confirmed order, complete with a
 * QR voucher. That is a fabricated transaction record, so the fixtures are
 * gone and the list is empty on purpose.
 *
 * The exports stay because the pages and `lib/api` are written against them;
 * an empty list makes every reference 404 until the real order lookup is
 * wired in. Do not repopulate this for a demo — point the pages at the API.
 */
export const bookings: Booking[] = [];

export const bookingByReference = (ref: string) =>
  bookings.find((b) => b.reference.toLowerCase() === ref.trim().toLowerCase());

export const upcomingBookings = bookings.filter(
  (b) => b.status === "confirmed" || b.status === "supplier_pending",
);
export const pastBookings = bookings.filter(
  (b) => b.status === "completed" || b.status === "cancelled",
);
