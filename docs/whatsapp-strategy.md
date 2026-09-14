# WhatsApp conversion strategy (Rail B)

## 1. The principle

WhatsApp is a **booking rail**, not a support widget. PRD §0 calls it "the
single highest-leverage UI element in the product", and the target GMV split at
maturity is 55% self-serve / 45% assisted.

Two rules govern every placement:

1. **Both rails write to the same order object.** An agent-placed order uses the
   same booking engine, produces the same voucher, and carries the same
   cancellation rights. There is no second system.
2. **Offered, never forced.** A customer who can self-serve in ninety seconds
   should not be routed into a conversation. WhatsApp never replaces the Book
   button; it sits beside it.

## 2. Context passing (AC-WA-01)

`src/lib/whatsapp.ts` composes every message. The agent opens the conversation
already knowing what the customer is looking at:

```
Hi OUTLY! I have a question about this activity before I book.

Activity: Evening Desert Safari with Pure Veg & Jain Dinner — Private 4x4
Date: Sat, 14 Sept · 15:00 pickup
Guests: 2 adults, 2 children, 3 seniors
Price shown: ₹20,930
Link: https://outly.in/activities/evening-desert-safari-veg-jain
```

Passed where known: activity or package name and URL, selected variant, date,
time, pax breakdown, price displayed, booking reference, checkout step, and a
free-text question.

Every open fires `whatsapp_initiated` with the intent, the SKU, the date, the
guest count and the placement — logged as a **conversion event**, not an
engagement one.

## 3. Placements & triggers

| Placement | Component | Intent | Trigger | Copy |
|---|---|---|---|---|
| Header | `WhatsAppButton` | `general` | Always (≥xl) | "WhatsApp us" |
| Mobile menu | `WhatsAppButton` | `general` | Drawer open | "Chat with a Dubai expert" |
| Homepage FAQ + footer | `WhatsAppCard` | `general` | Always | "Chat with a Dubai expert" |
| Floating button | `FloatingWhatsApp` | page-specific | Every page; raises above sticky bars | "Chat with us" |
| **ADP booking widget** | `WhatsAppButton` | `activity`, or `group` at 5+ pax | Always, **equal weight to Book now** | "Ask on WhatsApp" / "Booking for 5+? We'll plan it" |
| ADP sticky bar | `WhatsAppButton` | `activity` | After 520px scroll | "Ask" |
| ADP body | `WhatsAppCard` | `activity` | Below FAQs | "Still deciding? Ask before you book." |
| Availability error | `WhatsAppButton` | `availability` | API error/timeout | "Check my dates on WhatsApp" |
| Quote-only SKU | `WhatsAppButton` | `quote` | Tier D | "Request a quote" |
| Search / category | `WhatsAppCard` | `general` | Below results | "Can't find the right thing?" |
| Search empty | in `EmptyState` | `general` | Zero results | Passes the failed query |
| Compare | `WhatsAppCard` | `activity` | Always | Passes all compared SKU names |
| Cart | `WhatsAppCard` | `group` | Always | Passes the whole trip |
| Wishlist | `WhatsAppButton` | `group` | With items | "Price this list" |
| Checkout header | `WhatsAppButton` | `checkout_help` | Always | "Finish this on WhatsApp" |
| Checkout body | `WhatsAppCard` | `checkout_help` | Always | "Rather have a person do this?" |
| Payment failure | `WhatsAppButton` | `payment_help` | On failure | "Payment trouble? Message us" |
| Confirmation | Button + `WhatsAppCard` | `voucher`, `booking_support` | Always | "Send voucher to WhatsApp" |
| Voucher | `WhatsAppButton` | `booking_support` | Always | "Something wrong on the day?" |
| Booking detail | Sidebar + driver panel | `booking_support` | Always / inside 48h | "Driver hasn't arrived" |
| Cancellation sheet | `WhatsAppButton` | `cancellation` | Before confirming | "Talk to us before you cancel" |
| Review form | `WhatsAppButton` | `booking_support` | Always | "Something went wrong on the trip" |
| Concierge | `WhatsAppButton` | `concierge` | Hero + after submit | "Speak to a trip designer" |
| 404 / error pages | Card / link | `general` | Always | "Looking for something specific?" |
| Maintenance | Direct link | — | Always | Booking by message while the site is down |

## 4. Intent taxonomy

`general` · `activity` · `combo` · `availability` · `group` · `dietary` ·
`checkout_help` · `payment_help` · `abandoned_checkout` · `booking_support` ·
`cancellation` · `modification` · `voucher` · `concierge` · `quote`

Each has its own opening line and CTA label in `WHATSAPP_COPY`, so the copy
stays consistent across 25+ placements and an agent can tell from the first line
what kind of conversation this is.

## 5. Escalation rules

| Condition | Route |
|---|---|
| Order > ₹25,000 | Phone number displayed alongside WhatsApp |
| All Tier D / private charters | Named coordinator with direct WhatsApp **and** phone |
| Within 48 hours of travel | Phone surfaced on the booking page; driver call button |
| In-destination emergency | 24/7 number on the voucher itself |
| Out of hours | Automated acknowledgement within 60s stating the expected reply time |
| Dietary failure reported | Same-day ops alert, meal refund, supplier scorecard |
| Supplier rejection | Proactive contact within 2 hours with three options |

## 6. Outbound message flows (integration required)

Implemented as UI affordances and consent capture; the sending side is a BSP
integration.

1. Pre-purchase enquiry — context-passed from web ✅ implemented
2. Abandoned checkout recovery — T+30min, **consent-gated** (checkbox at
   checkout, AC-CO-06) ✅ consent captured, sending pending
3. Booking confirmation + PDF voucher ✅ triggered, delivery mocked
4. Balance payment reminder for deposit bookings — flagged at checkout
5. T-2 pre-trip, T-1 driver details, day-of "driver arriving"
6. **In-trip upsell (day 1, day 3)** — the attach loop; surfaces exist on the
   booking page
7. Post-trip review request at T+2 days → `/reviews/[booking]`
8. Expat seasonal campaigns

## 7. Consent

- Checkout consent checkbox covers both voucher delivery and recovery messaging,
  and states the consequence of unticking it.
- Signup marketing consent is separate from transactional messaging.
- `/account/profile` exposes per-channel toggles that take effect immediately.
- One-tap STOP is honoured within 60 seconds across every flow (AC-WA-03) — this
  is a BSP configuration requirement, documented for the integration.

## 8. What we deliberately do not do

- No WhatsApp-only inventory. Everything an agent can book, a customer can book.
- No hiding the price behind an enquiry.
- No auto-opening chat on page load.
- No WhatsApp CTA that outranks Book now on a simple, instantly bookable ticket.
