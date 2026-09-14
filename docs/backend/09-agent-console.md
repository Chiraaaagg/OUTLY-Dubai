# Phase 10 — Agent Console

*`docs/known-limitations.md` calls this "the highest-priority missing piece." That is correct — Rail B is 45% of target GMV and cannot operate without it.*

---

## 1. Scope

The console is **not** a helpdesk. A helpdesk answers questions; this takes money. It is a sales tool with a support surface attached, and the distinction determines what gets built first.

Build order, by revenue dependency:

1. **Quote builder** — the non-commodity part, and the reason to build rather than buy (Decision D4)
2. **Customer 360** — `AC-SUP-02` requires it within one click
3. **Conversation inbox** — the surface the agent lives in
4. **Booking builder** — placing the order the quote won
5. Support panel, lead queue, permissions, recommendations

An agent with 1, 2 and 4 and no inbox can still work from the BSP's own inbox and take bookings. An agent with an inbox and no quote builder cannot sell.

---

## 2. The single architectural rule

**An agent-created order calls `order.createOrder(input, actor)` — the same service function the storefront calls.**

PRD §0: *"A WhatsApp agent placing an order is using the same booking engine as a self-serve customer, through an internal console. We do not build two systems. If we do, reconciliation, refunds, and analytics will break within three months."*

The console is a **different UI over the same services**, with `rail = 'assisted'` and an actor identity. Same quotes, same availability verification, same capacity locks, same idempotency, same fulfilment, same voucher, same cancellation rights.

Agent-specific capabilities are named permissions with audit trails (§06.9), never code branches. If you ever find yourself writing `if (isAgent)` inside a service, stop — it belongs in the permission matrix instead.

---

## 3. Features

### 3.1 Dashboard
Today's assigned conversations, open leads, quotes awaiting response, bookings needing action (supplier pending, SLA breaching), personal conversion rate and GMV this month, response-time metric versus the 8-minute SLA.

### 3.2 Lead queue
Sources: WhatsApp inbound, `/concierge`, Tier D quote requests, `/contact`, abandoned checkouts with consent.
Sorted by a priority score: order value potential × recency × segment (expat weighted up, per the LTV table) × SLA remaining.
Each lead shows entry context — the SKU they were looking at, dates, pax, dietary filters applied, and pages viewed.

### 3.3 Quote builder — the core

```
┌──────────────────────────────────────────────────────────────────────┐
│  Quote for Rajesh Patel · +91 98765 43210 · 14–18 Sept · 7 pax      │
│  Context: viewed Evening Desert Safari (Jain) · applied Jain filter  │
├──────────────────────────────────────────────────────────────────────┤
│  OPTION A — what they asked for                                      │
│    Evening Desert Safari, Jain dinner · 14 Sept · 2A 2C 3S           │
│    Retail ₹20,930   Net ₹14,800   Margin 29.3%  ✓ above floor        │
│                                                                       │
│  OPTION B — better version                    [recommended]          │
│    Gentle Safari (no dune bashing) + private 4x4 · 14 Sept           │
│    Retail ₹24,400   Net ₹16,900   Margin 30.7%  ✓                    │
│    ⚑ senior-suitable — matches "3 seniors, one can't dune bash"      │
│                                                                       │
│  OPTION C — combo                             [highest margin]       │
│    Family Fun Pack: safari + Marina dhow + Burj sunset               │
│    Retail ₹41,200   Separately ₹46,900  Save ₹5,700                  │
│    Net ₹28,100   Margin 31.8%  ✓          Tier C                     │
├──────────────────────────────────────────────────────────────────────┤
│  All three: availability ✓ verified 30s ago · prices locked 20 min   │
│  [ Send on WhatsApp ]  [ Generate payment link ]  [ Save draft ]     │
└──────────────────────────────────────────────────────────────────────┘
```

Requirements:

- **Always three options.** The business model makes this a scripted rule: *"Never quote a single SKU. Always present three options: the SKU asked for, a better version, and a combo."* The UI should make quoting one option harder than quoting three.
- **Live net rates and margin on screen** — *"ops must never price blind"* (PRD §12). Margin shown per option and for the quote total.
- **Margin floor enforced visually and server-side.** Below floor → blocked unless the agent holds `pricing.override_floor`, and then a reason is mandatory and logged.
- **Availability verified before the quote is sent**, with a visible timestamp. Never quote a sold-out slot.
- **Each option is a real `quotes` row** — signed, 20-minute expiry, single-use. The payment link references quote IDs, so the price the customer pays is the price the agent quoted, enforced by the same machinery as self-serve.
- **`AC-SUP-03`: build and send a multi-SKU quote with a payment link in under 3 minutes.** Achieved by pre-filled context, saved templates, and one-click combo suggestions — measure it and treat it as an acceptance test, not an aspiration.

### 3.4 Booking builder
Convert an accepted quote into an order: collect traveller details (pre-filled from customer 360 and saved traveller profiles), choose payment mode (link / full / deposit / invoice for Tier D), create the order, send the link. Payment arrives by webhook exactly as self-serve; fulfilment and voucher are identical.

### 3.5 Customer 360 — `AC-SUP-02`, one click

One query, one panel:

- Identity, segment (FIT/expat/agent), LTV, booking count, dietary preference
- **All orders** — upcoming, past, cancelled — with status and voucher links
- **Current trip** if in Dubai now (drives the in-trip attach loop)
- **Browsing context** — last 20 `analytics_events` for the linked session: pages viewed, filters applied, cart contents, quotes generated
- Wishlist, credits balance, referral status
- Full conversation history across channels
- Open support tickets
- Consent state per channel

The browsing context is the part that feels like magic to the customer and is trivially cheap to build, because the events are already flowing into `analytics_events`. An agent who opens with *"I see you were looking at the Jain safari for the 14th for seven people"* converts materially better than one who asks.

### 3.6 Conversation inbox
Unified across WhatsApp, email and web (PRD §5.14). Assignment, snooze, resolve, internal notes, canned responses with variable substitution, full history on handoff, SLA timer visible per conversation.

### 3.7 Support panel
Open the order, see everything in one view — items, supplier, supplier contact, driver details, payment, voucher status, communication log, cancellation policy as shown at purchase. Actions: resend voucher, amend, cancel with refund quote, issue goodwill refund (permission-gated), escalate.

PRD §3.8 is blunt about why: *"An agent hunting through WhatsApp history during a pickup failure is a product failure."*

### 3.8 Activity recommendations
For quote option B and C, and for in-trip upsells. V1 is a rules engine — same category, one tier up, high margin, high reliability, available on the customer's dates, matching their dietary and suitability filters. `product_relations` weights refine it as data accumulates. ML is a V2+ conversation and needs volume first.

---

## 4. Permissions matrix

Roles from PRD §9.8, with the permissions that matter.

| Permission | Admin | Ops | Agent Lead | Agent | Finance | Content | Read-only |
|---|:--:|:--:|:--:|:--:|:--:|:--:|:--:|
| `conversations.view_own` | ✓ | ✓ | ✓ | ✓ | | | |
| `conversations.view_all` | ✓ | ✓ | ✓ | | | | ✓ |
| `conversations.assign` | ✓ | ✓ | ✓ | | | | |
| `quotes.create` | ✓ | ✓ | ✓ | ✓ | | | |
| `quotes.view_margin` | ✓ | ✓ | ✓ | **✓** | ✓ | | |
| `pricing.override` | ✓ | ✓ | ✓ | | | | |
| **`pricing.override_floor`** | ✓ | | **✓** | | | | |
| `orders.create` | ✓ | ✓ | ✓ | ✓ | | | |
| `orders.create_unpaid` | ✓ | ✓ | ✓ | | | | |
| `orders.confirm_unpaid` | ✓ | | | | ✓ | | |
| `orders.view_all` | ✓ | ✓ | ✓ | ✓ | ✓ | | ✓ |
| `orders.amend` | ✓ | ✓ | ✓ | ✓ | | | |
| `orders.cancel` | ✓ | ✓ | ✓ | | | | |
| **`refunds.initiate`** | ✓ | ✓ | ✓ | | ✓ | | |
| **`refunds.goodwill`** | ✓ | ✓ | | | ✓ | | |
| `inventory.force` | ✓ | ✓ | | | | | |
| `vouchers.resend` | ✓ | ✓ | ✓ | ✓ | | | |
| `customers.view_pii` | ✓ | ✓ | ✓ | ✓ | ✓ | | |
| `customers.export` | ✓ | | | | ✓ | | |
| `products.edit` | ✓ | ✓ | | | | ✓ | |
| `products.publish` | ✓ | ✓ | | | | | |
| `pricing.edit` | ✓ | ✓ | | | ✓ | | |
| `coupons.manage` | ✓ | ✓ | | | ✓ | | |
| `reviews.moderate` | ✓ | ✓ | | | | ✓ | |
| `suppliers.manage` | ✓ | ✓ | | | | | |
| `reports.financial` | ✓ | | | | ✓ | | ✓ |
| `settings.edit` | ✓ | | | | | | |
| `users.manage` | ✓ | | | | | | |
| `audit.view` | ✓ | ✓ | | | ✓ | | |

Notes on the deliberate choices:

- **Agents see margin.** Counterintuitive, but the business model's whole thesis is mix over markup — an agent who cannot see that the combo earns 31.8% cannot be expected to sell it. The risk (an agent discounting to close) is controlled by the floor, not by hiding the number.
- **`pricing.override_floor` is Admin and Agent Lead only.** The floor is the guardrail between a discount campaign and selling at a loss.
- **`refunds.goodwill` excludes Agent Lead.** Goodwill refunds are a cost centre that needs a second pair of eyes.
- **`inventory.force` is Ops only, and never applies to API suppliers** (`AC-INV-02`).

**Enforcement is server-side in every service call** (`AC-ADM-02`), never in the UI. The UI hides what the permission does not allow; the service refuses it regardless.

---

## 5. Database requirements

Mostly satisfied by §05. Additions:

```sql
CREATE TABLE agent_quotes (              -- the multi-option quote sent to a customer
  id UUID PRIMARY KEY,
  conversation_id UUID REFERENCES wa_conversations(id),
  lead_id UUID REFERENCES leads(id),
  agent_id UUID NOT NULL REFERENCES admin_users(id),
  customer_phone TEXT NOT NULL,
  options JSONB NOT NULL,                -- [{ label, quoteIds[], totalInr, netAed, marginPct }]
  recommended_option INT,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','sent','viewed','accepted','expired','lost')),
  sent_at TIMESTAMPTZ, viewed_at TIMESTAMPTZ, accepted_at TIMESTAMPTZ,
  accepted_option INT,
  payment_link_id TEXT, payment_link_url TEXT,
  converted_order_id UUID REFERENCES orders(id),
  lost_reason TEXT,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ON agent_quotes (agent_id, status, created_at DESC);

CREATE TABLE canned_responses (
  id UUID PRIMARY KEY,
  code TEXT UNIQUE NOT NULL,
  category TEXT NOT NULL,
  body TEXT NOT NULL,                    -- {{customerName}}, {{activityTitle}}, {{date}}
  variables TEXT[] NOT NULL DEFAULT '{}',
  language TEXT NOT NULL DEFAULT 'en',
  usage_count INT NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE agent_availability (
  agent_id UUID PRIMARY KEY REFERENCES admin_users(id),
  status TEXT NOT NULL CHECK (status IN ('available','busy','away','offline')),
  max_concurrent INT NOT NULL DEFAULT 8,
  skills TEXT[] DEFAULT '{}',            -- 'hindi','luxury','groups','abu-dhabi'
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE agent_metrics_daily (       -- weekly SLA reporting (AC-SUP-01)
  agent_id UUID REFERENCES admin_users(id),
  date DATE NOT NULL,
  conversations_handled INT NOT NULL DEFAULT 0,
  median_first_response_seconds INT,
  quotes_sent INT NOT NULL DEFAULT 0,
  quotes_accepted INT NOT NULL DEFAULT 0,
  orders_created INT NOT NULL DEFAULT 0,
  gmv_inr BIGINT NOT NULL DEFAULT 0,
  margin_inr BIGINT NOT NULL DEFAULT 0,
  PRIMARY KEY (agent_id, date)
);
```

`agent_quotes` earns its place: quote-to-acceptance rate per agent, per option position, and per tier is how you learn whether the three-option rule actually works, and whether option C (the combo) is being accepted often enough to hit the 25–35% attach target.

---

## 6. API requirements

| Method | Endpoint | Permission | Notes |
|---|---|---|---|
| GET | `/api/agent/dashboard` | `conversations.view_own` | |
| GET | `/api/agent/leads` | `conversations.view_own` | Priority-sorted |
| POST | `/api/agent/leads/:id/claim` | | |
| GET | `/api/agent/conversations` | | Filters, assignment |
| GET | `/api/agent/conversations/:id` | | Full history |
| POST | `/api/agent/conversations/:id/messages` | | Send; CSW-aware (§08.2) |
| POST | `/api/agent/conversations/:id/assign` | `conversations.assign` | |
| GET | `/api/agent/customers/:phone/360` | `customers.view_pii` | **One call, `AC-SUP-02`** |
| POST | `/api/agent/quotes` | `quotes.create` | Multi-option; returns margin |
| POST | `/api/agent/quotes/:id/send` | | WhatsApp + payment link |
| POST | `/api/agent/quotes/:id/override-price` | `pricing.override` | Reason required; audited |
| POST | `/api/agent/orders` | `orders.create` | → `order.createOrder(input, actor)` |
| POST | `/api/agent/orders/:ref/payment-link` | | |
| POST | `/api/agent/orders/:ref/resend-voucher` | `vouchers.resend` | |
| POST | `/api/agent/orders/:ref/amend` | `orders.amend` | |
| POST | `/api/agent/orders/:ref/cancel` | `orders.cancel` | Refund quote first |
| POST | `/api/agent/orders/:ref/refund` | `refunds.initiate` | |
| GET | `/api/agent/recommendations` | | For quote options B and C |
| GET | `/api/agent/canned-responses` | | |
| PUT | `/api/agent/availability` | | |

Every mutating endpoint: `withAuth(permission)` + `withAudit(action)` + `withIdempotency` where money moves.

---

## 7. Build sequencing

| Phase | Ships | Why then |
|---|---|---|
| **MVP** | Customer 360 · quote builder (single option) · order creation · payment link · voucher resend | Minimum to take a WhatsApp booking through the real engine. Use the BSP's own inbox meanwhile |
| **V1** | Own inbox with assignment · three-option quoting with margin · canned responses · lead queue · support panel · metrics | Own the conversation once volume justifies it |
| **V2** | AI-drafted replies (human approves) · recommendation weighting from real data · skills routing | The throughput wall — attack at ~500 bookings/month, per the business model |

**The MVP line to hold:** an agent must be able to place an order that is indistinguishable from a self-serve order in the database. Everything else about the console is convenience.
