# Phase 5 — Database Design

*This is the most expensive artefact in the blueprint to change after launch. Review it hardest.*

---

## 1. Principles

1. **Money is `BIGINT` in minor units.** Paise for INR, fils for AED. Never `FLOAT`, never `DOUBLE`. Every monetary concept gets two columns (`*_inr`, `*_aed`) because INR and AED are set independently and never FX-derived (`AC-PRC-03`).
2. **Orders are immutable snapshots.** An order line stores the price, the pax breakdown, the cancellation policy and the inclusions **as they were at the moment of sale**. A product edit six months later must never change what a customer bought. This is the single most common OTA data bug.
3. **Soft delete for anything an order can reference.** `deleted_at TIMESTAMPTZ`. Hard delete only for records with a legal deletion obligation (§8).
4. **All timestamps `TIMESTAMPTZ`, stored UTC.** Two business timezones exist: **Asia/Kolkata** (customer, reporting) and **Asia/Dubai** (activity dates, timeslots, supplier cutoffs). An activity date is a *local Dubai date* — store it as `DATE` plus an explicit `timeslot` string, not as a UTC instant, or you will send people to the desert a day early.
5. **Enums as Postgres native enums** where the set is closed and stable; `TEXT` + check constraint where it will churn.
6. **Every state machine is guarded in the database**, not only in code — check constraints and partial unique indexes.
7. **UUIDv7 primary keys** (time-ordered, index-friendly) — except human-facing references, which get their own generated format.

---

## 2. Entity-relationship overview

```
                          ┌──────────┐
                          │  users   │◄────────┐
                          └────┬─────┘         │
             ┌─────────────────┼───────────┐   │
             │                 │           │   │
    ┌────────▼──────┐  ┌───────▼──────┐  ┌─▼───┴────────┐
    │traveller_     │  │saved_        │  │  referrals   │
    │profiles       │  │activities    │  │  credits     │
    └───────────────┘  └──────────────┘  └──────────────┘
             │
             │  (users optional — guest checkout is mandatory)
             ▼
   ┌──────────────┐        ┌──────────────┐        ┌──────────────┐
   │    carts     │───────►│    orders    │◄───────│    guests    │
   │  cart_items  │        │ order_items  │        └──────────────┘
   └──────────────┘        └──────┬───────┘
                                  │
        ┌──────────────┬──────────┼──────────┬────────────────┐
        │              │          │          │                │
  ┌─────▼─────┐  ┌─────▼────┐ ┌───▼─────┐ ┌──▼──────────┐ ┌───▼────────┐
  │ payments  │  │ bookings │ │tax_lines│ │ order_      │ │  refunds   │
  │payment_   │  │booking_  │ │         │ │ attribution │ │            │
  │ events    │  │ items    │ │         │ │             │ │            │
  │payment_   │  └────┬─────┘ └─────────┘ └─────────────┘ └────────────┘
  │ schedules │       │
  └───────────┘  ┌────▼──────────────┐  ┌──────────┐
                 │ supplier_bookings │  │ vouchers │
                 └────┬──────────────┘  └──────────┘
                      │
   ┌──────────────────▼────────────────────────────────────────┐
   │  product_supplier_mappings ──► suppliers                   │
   └──────────┬─────────────────────────────────────────────────┘
              │
      ┌───────▼────────┐
      │    products    │◄──── product_variants, product_addons,
      │                │      product_media, product_faqs,
      │                │      product_timeslots, product_relations
      └───┬────────┬───┘
          │        │
   ┌──────▼───┐ ┌──▼──────────┐ ┌─────────────┐ ┌──────────────────┐
   │categories│ │ combos      │ │ net_rates   │ │ availability_    │
   │collections│ │ combo_items│ │ price_rules │ │ cache            │
   │attractions│ └────────────┘ │ prices      │ │ capacity_ledger  │
   └──────────┘                 └─────────────┘ │ blackout_dates   │
                                                └──────────────────┘

   Cross-cutting: audit_logs · analytics_events · notifications ·
   wa_conversations/wa_messages · support_tickets · reviews ·
   coupons/coupon_redemptions · leads · settings · feature_flags ·
   admin_users/roles/permissions · idempotency_keys · job_executions
```

---

## 3. Schema

Written as annotated DDL. Prisma models map 1:1; where Prisma cannot express something (partial unique indexes, exclusion constraints, check constraints), it goes in a raw migration — **and those are the ones that protect money, so do not skip them.**

### 3.1 Identity

```sql
CREATE TABLE users (
  id                UUID PRIMARY KEY,
  phone_e164        TEXT UNIQUE,                 -- +919876543210
  email             CITEXT UNIQUE,
  full_name         TEXT,
  locale            TEXT NOT NULL DEFAULT 'en-IN',
  preferred_currency TEXT NOT NULL DEFAULT 'INR' CHECK (preferred_currency IN ('INR','AED')),
  segment           TEXT NOT NULL DEFAULT 'unknown'
                      CHECK (segment IN ('fit','expat','agent','unknown')),   -- AC-CRM-01
  segment_locked    BOOLEAN NOT NULL DEFAULT FALSE,  -- manual override wins over the auto-classifier
  dietary_pref      TEXT CHECK (dietary_pref IN ('veg','jain','halal','non-veg')),
  ltv_inr           BIGINT NOT NULL DEFAULT 0,       -- computed nightly
  booking_count     INT    NOT NULL DEFAULT 0,
  referral_code     TEXT UNIQUE,
  referred_by_user  UUID REFERENCES users(id),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at        TIMESTAMPTZ,
  CONSTRAINT users_identity_present CHECK (phone_e164 IS NOT NULL OR email IS NOT NULL)
);
CREATE INDEX ON users (segment) WHERE deleted_at IS NULL;
CREATE INDEX ON users (email) WHERE deleted_at IS NULL;

-- Guest checkout is mandatory (AC-CO-01). Guests are first-class, not degraded users.
CREATE TABLE guests (
  id           UUID PRIMARY KEY,
  phone_e164   TEXT NOT NULL,
  email        CITEXT NOT NULL,
  full_name    TEXT NOT NULL,
  linked_user  UUID REFERENCES users(id),   -- set when they later create an account (AC-ACC-02)
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ON guests (phone_e164);
CREATE INDEX ON guests (email);

CREATE TABLE traveller_profiles (           -- saved travellers; PRD §5.9
  id           UUID PRIMARY KEY,
  user_id      UUID NOT NULL REFERENCES users(id),
  full_name    TEXT NOT NULL,
  pax_type     TEXT NOT NULL CHECK (pax_type IN ('adult','child','infant','senior')),
  date_of_birth DATE,                        -- only when a supplier requires it
  dietary      TEXT,
  accessibility_notes TEXT,
  deleted_at   TIMESTAMPTZ
);

CREATE TABLE sessions (
  id             UUID PRIMARY KEY,
  user_id        UUID REFERENCES users(id),
  refresh_hash   TEXT NOT NULL,             -- hash only, never the token
  user_agent     TEXT,
  ip_hash        TEXT,                      -- hashed, not raw (DPDP minimisation)
  expires_at     TIMESTAMPTZ NOT NULL,
  revoked_at     TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ON sessions (user_id) WHERE revoked_at IS NULL;

CREATE TABLE consents (
  id          UUID PRIMARY KEY,
  user_id     UUID REFERENCES users(id),
  phone_e164  TEXT,                          -- consent can predate an account
  channel     TEXT NOT NULL CHECK (channel IN ('whatsapp','email','sms','push')),
  purpose     TEXT NOT NULL CHECK (purpose IN ('transactional','marketing','recovery')),
  granted     BOOLEAN NOT NULL,
  source      TEXT NOT NULL,                 -- 'checkout' | 'signup' | 'stop_keyword' | 'profile'
  evidence    JSONB,                         -- exact copy shown, page URL, IP hash
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ON consents (phone_e164, channel, created_at DESC);
```
> `consents` is append-only. Current state is the latest row per `(subject, channel, purpose)`. Never update in place — under DPDP you must be able to prove *when* consent was given or withdrawn, and with what wording.

### 3.2 Catalogue

```sql
CREATE TABLE suppliers (
  id                 UUID PRIMARY KEY,
  code               TEXT UNIQUE NOT NULL,        -- 'rathin', 'arabian-dunes'
  name               TEXT NOT NULL,
  source             TEXT NOT NULL CHECK (source IN ('direct','api','portal')),
  adapter            TEXT NOT NULL,               -- 'rathin' | 'manual' | 'portal'
  capabilities       JSONB NOT NULL,              -- SupplierCapabilities (§02.3.2)
  contact_name       TEXT,
  contact_whatsapp   TEXT,
  contact_email      TEXT,
  emergency_phone    TEXT,
  reliability_score  NUMERIC(5,2) NOT NULL DEFAULT 80,   -- computed nightly (§02.6.5)
  contracted_since   DATE,
  payment_terms      TEXT,                        -- 'prepaid' | 'net7' | 'net14' | 'net30'
  status             TEXT NOT NULL DEFAULT 'active'
                       CHECK (status IN ('active','paused','terminated')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

CREATE TABLE products (
  id                     UUID PRIMARY KEY,
  slug                   TEXT UNIQUE NOT NULL,
  title                  TEXT NOT NULL,
  subtitle               TEXT NOT NULL,
  tier                   CHAR(1) NOT NULL CHECK (tier IN ('A','B','C','D','E')),
  status                 TEXT NOT NULL DEFAULT 'draft'
                           CHECK (status IN ('draft','mapped','priced','review','published','paused','archived')),
  category_id            UUID NOT NULL REFERENCES categories(id),
  attraction_id          UUID REFERENCES attractions(id),

  -- attributes the storefront filters on
  duration_minutes       INT  NOT NULL,
  is_private             BOOLEAN NOT NULL DEFAULT FALSE,
  pickup_included        BOOLEAN NOT NULL DEFAULT FALSE,
  pickup_zones           TEXT[] NOT NULL DEFAULT '{}',
  confirmation           TEXT NOT NULL CHECK (confirmation IN ('instant','manual')),
  free_cancellation_hours INT  NOT NULL DEFAULT 0,
  dietary                TEXT[] NOT NULL DEFAULT '{}',   -- veg|jain|halal|non-veg — THE WEDGE
  suitability            TEXT[] NOT NULL DEFAULT '{}',   -- kids|seniors|wheelchair|infant|...
  quote_only             BOOLEAN NOT NULL DEFAULT FALSE, -- Tier D, AC-ADP-06

  location               TEXT NOT NULL,
  meeting_point          TEXT,
  timezone               TEXT NOT NULL DEFAULT 'Asia/Dubai',

  -- content we own entirely (§02.4)
  inclusions             TEXT[] NOT NULL DEFAULT '{}',
  exclusions             TEXT[] NOT NULL DEFAULT '{}',
  important_info         TEXT[] NOT NULL DEFAULT '{}',
  itinerary              JSONB NOT NULL DEFAULT '[]',
  meal_note              TEXT,
  cancellation_policy_id UUID REFERENCES cancellation_policies(id),

  -- derived, refreshed by jobs — never hand-edited
  rating_avg             NUMERIC(2,1),
  review_count           INT NOT NULL DEFAULT 0,
  booked_last_30d        INT NOT NULL DEFAULT 0,

  seo_title              TEXT,
  seo_description        TEXT,
  seo_keywords           TEXT[],
  search_vector          TSVECTOR,

  published_at           TIMESTAMPTZ,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at             TIMESTAMPTZ
);
CREATE INDEX ON products USING GIN (search_vector);
CREATE INDEX ON products USING GIN (dietary);
CREATE INDEX ON products USING GIN (suitability);
CREATE INDEX products_live_idx ON products (tier, category_id)
  WHERE status = 'published' AND deleted_at IS NULL;
CREATE INDEX ON products (slug) WHERE deleted_at IS NULL;

CREATE TABLE product_variants (
  id UUID PRIMARY KEY,
  product_id UUID NOT NULL REFERENCES products(id),
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  blurb TEXT,
  delta_inr BIGINT NOT NULL DEFAULT 0,   -- may be negative
  delta_aed BIGINT NOT NULL DEFAULT 0,
  is_private BOOLEAN NOT NULL DEFAULT FALSE,
  accessibility_note TEXT,               -- "Gentle safari — no dune bashing"
  is_recommended BOOLEAN NOT NULL DEFAULT FALSE,
  sort_order INT NOT NULL DEFAULT 0,
  deleted_at TIMESTAMPTZ,
  UNIQUE (product_id, code)
);

CREATE TABLE product_addons (
  id UUID PRIMARY KEY,
  product_id UUID NOT NULL REFERENCES products(id),
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  category TEXT NOT NULL CHECK (category IN ('transfer','meal','photo','occasion','access','comfort')),
  price_inr BIGINT NOT NULL,
  price_aed BIGINT NOT NULL,
  per_person BOOLEAN NOT NULL DEFAULT FALSE,
  deleted_at TIMESTAMPTZ,
  UNIQUE (product_id, code)
);

CREATE TABLE product_media (
  id UUID PRIMARY KEY,
  product_id UUID NOT NULL REFERENCES products(id),
  kind TEXT NOT NULL CHECK (kind IN ('image','video','ugc')),
  url TEXT NOT NULL, alt TEXT NOT NULL, sort_order INT NOT NULL DEFAULT 0,
  deleted_at TIMESTAMPTZ
);

CREATE TABLE product_timeslots (
  id UUID PRIMARY KEY,
  product_id UUID NOT NULL REFERENCES products(id),
  label TEXT NOT NULL,                 -- "15:00 pickup" — display string
  start_local TIME NOT NULL,           -- Asia/Dubai
  days_of_week SMALLINT[] NOT NULL DEFAULT '{0,1,2,3,4,5,6}',
  UNIQUE (product_id, label)
);

CREATE TABLE product_supplier_mappings (
  id UUID PRIMARY KEY,
  product_id  UUID NOT NULL REFERENCES products(id),
  supplier_id UUID NOT NULL REFERENCES suppliers(id),
  variant_id  UUID REFERENCES product_variants(id),
  priority    INT  NOT NULL DEFAULT 1,   -- 1 = primary, 2 = failover (business model: 2 per Tier B SKU)
  external_ref JSONB NOT NULL,           -- {"parkId":..,"ticketTypeId":..} for Rathin
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (product_id, supplier_id, variant_id)
);
CREATE INDEX ON product_supplier_mappings (product_id, priority) WHERE is_active;
```
> `external_ref` is JSONB deliberately: Rathin's identifier shape is unknown until the spike, and other suppliers will differ. Keeping it opaque means a new adapter needs no migration.

```sql
CREATE TABLE categories (
  id UUID PRIMARY KEY, slug TEXT UNIQUE NOT NULL, name TEXT NOT NULL,
  short_name TEXT, tagline TEXT, intro TEXT, hero_image TEXT,
  parent_id UUID REFERENCES categories(id),
  seo_title TEXT, seo_description TEXT, sort_order INT DEFAULT 0,
  deleted_at TIMESTAMPTZ
);

CREATE TABLE collections (          -- editorial, hand-curated
  id UUID PRIMARY KEY, slug TEXT UNIQUE NOT NULL, name TEXT NOT NULL,
  audience TEXT, tagline TEXT, narrative TEXT, hero_image TEXT,
  tone TEXT CHECK (tone IN ('warm','premium','playful')),
  deleted_at TIMESTAMPTZ
);
CREATE TABLE collection_products (
  collection_id UUID REFERENCES collections(id),
  product_id UUID REFERENCES products(id),
  sort_order INT DEFAULT 0,
  PRIMARY KEY (collection_id, product_id)
);

CREATE TABLE attractions (          -- Tier A SEO magnet hubs
  id UUID PRIMARY KEY, slug TEXT UNIQUE NOT NULL, name TEXT NOT NULL,
  blurb TEXT, hero_image TEXT, practical JSONB, best_time TEXT,
  getting_there TEXT, deleted_at TIMESTAMPTZ
);

CREATE TABLE combos (               -- Tier C — the take-rate engine
  id UUID PRIMARY KEY,
  slug TEXT UNIQUE NOT NULL, name TEXT NOT NULL, tagline TEXT, hero_image TEXT,
  tier CHAR(1) NOT NULL DEFAULT 'C',
  audience TEXT CHECK (audience IN ('family','couple','luxury','everyone')),
  bundle_price_inr BIGINT NOT NULL,        -- set INDEPENDENTLY, not a sum
  bundle_price_aed BIGINT NOT NULL,
  validity TEXT, duration_label TEXT,
  confirmation TEXT NOT NULL CHECK (confirmation IN ('instant','manual')),
  cancellation_policy_id UUID REFERENCES cancellation_policies(id),
  status TEXT NOT NULL DEFAULT 'draft',
  deleted_at TIMESTAMPTZ
);
CREATE TABLE combo_items (
  id UUID PRIMARY KEY,
  combo_id UUID NOT NULL REFERENCES combos(id),
  product_id UUID NOT NULL REFERENCES products(id),
  variant_id UUID REFERENCES product_variants(id),
  day_offset INT NOT NULL DEFAULT 0,       -- day 0, 1, 2 of the trip
  quantity   INT NOT NULL DEFAULT 1,
  sort_order INT NOT NULL DEFAULT 0
);

CREATE TABLE product_relations (          -- "families who booked this also booked"
  product_id UUID REFERENCES products(id),
  related_id UUID REFERENCES products(id),
  kind TEXT NOT NULL CHECK (kind IN ('related','upsell','combo_candidate')),
  weight NUMERIC(3,2) DEFAULT 1,
  PRIMARY KEY (product_id, related_id, kind)
);
```

### 3.3 Pricing

```sql
CREATE TABLE net_rates (                  -- COST. Never exposed to a customer.
  id UUID PRIMARY KEY,
  product_id  UUID NOT NULL REFERENCES products(id),
  supplier_id UUID NOT NULL REFERENCES suppliers(id),
  variant_id  UUID REFERENCES product_variants(id),
  pax_type    TEXT NOT NULL CHECK (pax_type IN ('adult','child','infant','senior')),
  net_aed     BIGINT NOT NULL,            -- suppliers quote in AED
  valid_from  DATE NOT NULL,
  valid_to    DATE NOT NULL,
  source      TEXT NOT NULL CHECK (source IN ('contract','api_sync','manual')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (valid_to >= valid_from)
);
CREATE INDEX ON net_rates (product_id, supplier_id, pax_type, valid_from, valid_to);

CREATE TABLE price_rules (                -- the take-rate ladder, as DATA (AC-SRCH-05 sibling)
  id UUID PRIMARY KEY,
  scope       TEXT NOT NULL CHECK (scope IN ('tier','category','product','supplier')),
  scope_ref   TEXT NOT NULL,              -- 'B' | category slug | product id
  rule_type   TEXT NOT NULL CHECK (rule_type IN ('markup','season','lead_time','pax_group')),
  params      JSONB NOT NULL,             -- {"markupPct":28} | {"from":"2026-11-01","to":"2027-03-31","upliftPct":12}
  priority    INT NOT NULL DEFAULT 100,
  active      BOOLEAN NOT NULL DEFAULT TRUE,
  created_by  UUID REFERENCES admin_users(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE margin_floors (
  tier CHAR(1) PRIMARY KEY,
  floor_pct NUMERIC(5,2) NOT NULL         -- A:5, B:20, C:22, D:28, E:35  [confirm with commercial]
);

CREATE TABLE prices (                     -- published RETAIL price. INR and AED independent.
  id UUID PRIMARY KEY,
  product_id UUID NOT NULL REFERENCES products(id),
  variant_id UUID REFERENCES product_variants(id),
  pax_type   TEXT NOT NULL CHECK (pax_type IN ('adult','child','infant','senior')),
  price_inr  BIGINT NOT NULL,
  price_aed  BIGINT NOT NULL,
  compare_at_inr BIGINT,                  -- ONLY if verifiable; see compare_at_source
  compare_at_aed BIGINT,
  compare_at_source TEXT,                 -- URL/document proving the gate price. NULL ⇒ do not display
  compare_at_verified_at DATE,
  valid_from DATE NOT NULL,
  valid_to   DATE,
  is_current BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX prices_one_current ON prices (product_id, COALESCE(variant_id,'00000000-0000-0000-0000-000000000000'::uuid), pax_type)
  WHERE is_current;

CREATE TABLE price_change_log (           -- AC-PRC-04
  id UUID PRIMARY KEY,
  product_id UUID NOT NULL,
  variant_id UUID, pax_type TEXT,
  old_inr BIGINT, new_inr BIGINT, old_aed BIGINT, new_aed BIGINT,
  margin_pct_before NUMERIC(5,2), margin_pct_after NUMERIC(5,2),
  floor_override BOOLEAN NOT NULL DEFAULT FALSE,
  override_reason TEXT,                   -- AC-PRC-01 requires a logged reason
  actor_id UUID, actor_type TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (NOT floor_override OR override_reason IS NOT NULL)
);
```
> `compare_at_source` is deliberate. `PriceBand.compareAt` exists in the frontend and renders a struck-through price. Displaying one without a verifiable published rate is a misleading-price problem under Indian consumer law, not just a dark pattern. **No source, no strikethrough** — enforce it in the read model.

### 3.4 Availability and capacity

```sql
CREATE TABLE availability_cache (         -- L2; L1 is Redis
  id UUID PRIMARY KEY,
  mapping_id  UUID NOT NULL REFERENCES product_supplier_mappings(id),
  service_date DATE NOT NULL,             -- LOCAL Dubai date
  status TEXT NOT NULL CHECK (status IN ('available','limited','sold_out','unavailable')),
  spots_left INT,
  slots JSONB NOT NULL DEFAULT '[]',
  checked_at TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('supplier','ledger','stale')),
  UNIQUE (mapping_id, service_date)
);
CREATE INDEX ON availability_cache (expires_at);

CREATE TABLE capacity_ledger (            -- OUR inventory: direct/manual SKUs only
  id UUID PRIMARY KEY,
  product_id  UUID NOT NULL REFERENCES products(id),
  supplier_id UUID NOT NULL REFERENCES suppliers(id),
  service_date DATE NOT NULL,
  timeslot    TEXT,
  capacity    INT NOT NULL,               -- freesale cap agreed with the supplier
  committed   INT NOT NULL DEFAULT 0,     -- confirmed bookings
  held        INT NOT NULL DEFAULT 0,     -- in-flight checkouts
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (product_id, supplier_id, service_date, COALESCE(timeslot,'')),
  CONSTRAINT capacity_not_oversold CHECK (committed + held <= capacity)
);
```
> **`capacity_not_oversold` is the most important constraint in this schema.** With `SELECT ... FOR UPDATE` on the row inside the order transaction, overselling our own inventory becomes impossible at the database level rather than merely unlikely at the application level. PRD calls overselling *"the worst failure mode in this product"*; this is the line that prevents it.

```sql
CREATE TABLE blackout_dates (
  id UUID PRIMARY KEY,
  product_id UUID REFERENCES products(id),
  supplier_id UUID REFERENCES suppliers(id),
  from_date DATE NOT NULL, to_date DATE NOT NULL,
  reason TEXT,
  CHECK (product_id IS NOT NULL OR supplier_id IS NOT NULL),
  CHECK (to_date >= from_date)
);
```

### 3.5 Quotes, carts and orders — the money path

```sql
-- The server-signed quote. This is what makes AC-ADP-05 / AC-CO-02 enforceable.
CREATE TABLE quotes (
  id            UUID PRIMARY KEY,
  cart_id       UUID REFERENCES carts(id),
  product_id    UUID REFERENCES products(id),
  combo_id      UUID REFERENCES combos(id),
  variant_id    UUID REFERENCES product_variants(id),
  service_date  DATE NOT NULL,
  timeslot      TEXT,
  pax           JSONB NOT NULL,            -- {adult,child,infant,senior}
  addon_ids     UUID[] NOT NULL DEFAULT '{}',
  currency      TEXT NOT NULL CHECK (currency IN ('INR','AED')),
  breakdown     JSONB NOT NULL,            -- exact lines rendered to the customer
  subtotal_inr  BIGINT NOT NULL, subtotal_aed BIGINT NOT NULL,
  total_inr     BIGINT NOT NULL, total_aed BIGINT NOT NULL,
  net_cost_aed  BIGINT NOT NULL,           -- for margin at time of sale
  signature     TEXT NOT NULL,             -- HMAC over the canonical payload
  expires_at    TIMESTAMPTZ NOT NULL,      -- +20 min (PRICE_LOCK_MINUTES)
  consumed_by_order UUID REFERENCES orders(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (product_id IS NOT NULL OR combo_id IS NOT NULL)
);
CREATE INDEX ON quotes (cart_id) WHERE consumed_by_order IS NULL;
CREATE INDEX ON quotes (expires_at);

CREATE TABLE carts (
  id UUID PRIMARY KEY,
  user_id  UUID REFERENCES users(id),
  anon_id  TEXT,                            -- httpOnly cookie for guests
  currency TEXT NOT NULL DEFAULT 'INR',
  coupon_code TEXT,
  traveller JSONB,                          -- partial checkout state, for recovery
  price_lock_started_at TIMESTAMPTZ,
  last_activity_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  recovery_sent_at TIMESTAMPTZ,             -- abandoned-cart, AC-CO-06
  converted_order_id UUID REFERENCES orders(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL           -- 30d logged-in, 7d guest (AC-CART-03)
);
CREATE INDEX ON carts (anon_id) WHERE converted_order_id IS NULL;
CREATE INDEX ON carts (last_activity_at) WHERE converted_order_id IS NULL AND recovery_sent_at IS NULL;

CREATE TABLE cart_items (
  id UUID PRIMARY KEY,
  cart_id UUID NOT NULL REFERENCES carts(id) ON DELETE CASCADE,
  quote_id UUID NOT NULL REFERENCES quotes(id),
  sort_order INT NOT NULL DEFAULT 0,
  added_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```
> A cart item **is** a quote reference. The cart holds no prices of its own, so there is exactly one place a price can come from.

```sql
CREATE TYPE order_status AS ENUM (
  'pending_payment','payment_failed','paid','supplier_pending',
  'confirmed','partially_confirmed','cancelled','refunded','completed'
);

CREATE TABLE orders (
  id            UUID PRIMARY KEY,
  reference     TEXT UNIQUE NOT NULL,       -- OUT-482913 (sequence + checksum, NOT a hash of inputs)
  status        order_status NOT NULL DEFAULT 'pending_payment',
  rail          TEXT NOT NULL CHECK (rail IN ('self_serve','assisted')),
  user_id       UUID REFERENCES users(id),
  guest_id      UUID REFERENCES guests(id),
  cart_id       UUID REFERENCES carts(id),
  created_by_agent UUID REFERENCES admin_users(id),   -- Rail B: who placed it

  currency      TEXT NOT NULL CHECK (currency IN ('INR','AED')),
  subtotal_inr  BIGINT NOT NULL, subtotal_aed BIGINT NOT NULL,
  discount_inr  BIGINT NOT NULL DEFAULT 0, discount_aed BIGINT NOT NULL DEFAULT 0,
  tax_inr       BIGINT NOT NULL DEFAULT 0, tax_aed BIGINT NOT NULL DEFAULT 0,
  total_inr     BIGINT NOT NULL, total_aed BIGINT NOT NULL,
  net_cost_aed  BIGINT NOT NULL,            -- margin at time of sale, frozen
  coupon_code   TEXT,

  -- traveller snapshot (people change their profile; an order must not)
  lead_name TEXT NOT NULL, lead_email CITEXT NOT NULL, lead_phone TEXT NOT NULL,
  hotel TEXT, pickup_zone TEXT,
  dietary TEXT, special_requests TEXT,

  payment_mode  TEXT NOT NULL DEFAULT 'full' CHECK (payment_mode IN ('full','deposit')),
  idempotency_key TEXT,

  placed_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  paid_at      TIMESTAMPTZ,
  confirmed_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT order_has_buyer CHECK (user_id IS NOT NULL OR guest_id IS NOT NULL),
  CONSTRAINT order_totals_consistent CHECK (total_inr = subtotal_inr - discount_inr + tax_inr)
);
CREATE UNIQUE INDEX orders_idem ON orders (idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE INDEX ON orders (status, placed_at DESC);
CREATE INDEX ON orders (lead_phone);
CREATE INDEX ON orders (lead_email);
CREATE INDEX ON orders (rail, placed_at DESC);      -- GMV split by rail (PRD §8 dashboard 1)

CREATE TABLE order_items (
  id UUID PRIMARY KEY,
  order_id UUID NOT NULL REFERENCES orders(id),
  quote_id UUID REFERENCES quotes(id),
  product_id UUID REFERENCES products(id),
  combo_id   UUID REFERENCES combos(id),
  variant_id UUID REFERENCES product_variants(id),
  mapping_id UUID REFERENCES product_supplier_mappings(id),

  -- IMMUTABLE SNAPSHOT — never joined for display, never recomputed
  title_snapshot TEXT NOT NULL,
  tier_snapshot CHAR(1) NOT NULL,
  inclusions_snapshot TEXT[] NOT NULL DEFAULT '{}',
  cancellation_policy_snapshot JSONB NOT NULL,
  confirmation_snapshot TEXT NOT NULL,
  free_cancellation_hours_snapshot INT NOT NULL,

  service_date DATE NOT NULL,
  timeslot TEXT,
  pax JSONB NOT NULL,
  addons JSONB NOT NULL DEFAULT '[]',

  unit_inr BIGINT NOT NULL, unit_aed BIGINT NOT NULL,
  total_inr BIGINT NOT NULL, total_aed BIGINT NOT NULL,
  net_cost_aed BIGINT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','confirmed','rejected','cancelled','completed'))
);
CREATE INDEX ON order_items (order_id);
CREATE INDEX ON order_items (service_date) WHERE status = 'confirmed';   -- daily manifests

CREATE TABLE tax_lines (                   -- TCS / GST — shape ready, blocked on B2
  id UUID PRIMARY KEY,
  order_id UUID NOT NULL REFERENCES orders(id),
  kind TEXT NOT NULL CHECK (kind IN ('tcs','gst','vat','other')),
  label TEXT NOT NULL,                     -- customer-visible wording
  rate_pct NUMERIC(6,3),
  base_inr BIGINT NOT NULL,
  amount_inr BIGINT NOT NULL,
  refundable_note TEXT,                    -- "refundable via your ITR" for TCS
  legal_basis TEXT                         -- section reference, for the invoice
);
```

### 3.6 Payments and refunds

```sql
CREATE TABLE payments (
  id UUID PRIMARY KEY,
  order_id UUID NOT NULL REFERENCES orders(id),
  gateway TEXT NOT NULL,                   -- 'razorpay' | 'telr' | ...
  gateway_order_id TEXT, gateway_payment_id TEXT,
  method TEXT,                             -- upi | card | netbanking | wallet | emi
  amount_minor BIGINT NOT NULL,
  currency TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN
    ('created','authorized','captured','failed','refunded','partially_refunded')),
  failure_code TEXT, failure_reason TEXT,
  is_deposit BOOLEAN NOT NULL DEFAULT FALSE,
  fee_minor BIGINT, tax_on_fee_minor BIGINT,   -- gateway cost; reconciliation
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  captured_at TIMESTAMPTZ
);
CREATE UNIQUE INDEX ON payments (gateway, gateway_payment_id) WHERE gateway_payment_id IS NOT NULL;
CREATE INDEX ON payments (order_id);

CREATE TABLE payment_events (              -- IMMUTABLE. Append only. Never updated, never deleted.
  id UUID PRIMARY KEY,
  gateway TEXT NOT NULL,
  gateway_event_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL,
  signature_valid BOOLEAN NOT NULL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at TIMESTAMPTZ,
  processing_error TEXT,
  UNIQUE (gateway, gateway_event_id)       -- webhook dedup, enforced by the DB
);

CREATE TABLE payment_schedules (           -- deposit 30/70 (PRD §5.6)
  id UUID PRIMARY KEY,
  order_id UUID NOT NULL REFERENCES orders(id),
  sequence INT NOT NULL,                   -- 1 = deposit, 2 = balance
  amount_inr BIGINT NOT NULL,
  due_at TIMESTAMPTZ NOT NULL,             -- T-7 days for the balance
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','paid','overdue','waived','cancelled')),
  payment_id UUID REFERENCES payments(id),
  reminder_sent_at TIMESTAMPTZ,
  UNIQUE (order_id, sequence)
);

CREATE TABLE refunds (
  id UUID PRIMARY KEY,
  order_id UUID NOT NULL REFERENCES orders(id),
  order_item_id UUID REFERENCES order_items(id),   -- NULL = whole order
  payment_id UUID REFERENCES payments(id),
  amount_minor BIGINT NOT NULL,
  currency TEXT NOT NULL,
  reason TEXT NOT NULL CHECK (reason IN
    ('customer_cancellation','supplier_rejection','duplicate','goodwill','chargeback','ops_error')),
  gateway_refund_id TEXT,
  status TEXT NOT NULL CHECK (status IN ('pending','processing','completed','failed')),
  supplier_recovery_aed BIGINT,            -- what we get back from the supplier — often less
  initiated_by UUID REFERENCES admin_users(id),
  initiated_at TIMESTAMPTZ NOT NULL DEFAULT now(),   -- AC-BM-02: within 24h of eligible cancellation
  completed_at TIMESTAMPTZ,
  customer_notified_at TIMESTAMPTZ
);
CREATE INDEX ON refunds (status, initiated_at);
```

### 3.7 Fulfilment and vouchers

```sql
CREATE TABLE supplier_bookings (
  id UUID PRIMARY KEY,
  order_item_id UUID NOT NULL REFERENCES order_items(id),
  supplier_id UUID NOT NULL REFERENCES suppliers(id),
  mapping_id UUID NOT NULL REFERENCES product_supplier_mappings(id),
  idempotency_key TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN
    ('queued','submitting','pending_manual','confirmed','rejected','cancelled','unknown','failed')),
  supplier_ref TEXT,
  request_payload JSONB, response_payload JSONB,
  attempt_count INT NOT NULL DEFAULT 0,
  last_error TEXT,
  sla_due_at TIMESTAMPTZ,                  -- manual SKUs: +2h (AC-INV-03)
  escalated_at TIMESTAMPTZ,
  submitted_at TIMESTAMPTZ, confirmed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (idempotency_key)
);
CREATE INDEX ON supplier_bookings (status, sla_due_at)
  WHERE status IN ('queued','submitting','pending_manual','unknown');
```
> **`status = 'unknown'`** is the state after a `createBooking` timeout with no lookup capability (§02.5.4). It is not an error state — it is a state requiring human reconciliation, and it must be visible and alarming in the admin UI.

```sql
CREATE TABLE booking_fulfilment (          -- driver/supplier details surfaced at T-1
  id UUID PRIMARY KEY,
  order_item_id UUID NOT NULL REFERENCES order_items(id) UNIQUE,
  supplier_contact_name TEXT, supplier_contact_phone TEXT,
  driver_name TEXT, driver_phone TEXT, driver_vehicle TEXT,
  pickup_window TEXT, pickup_address TEXT,
  updated_by UUID REFERENCES admin_users(id),
  updated_at TIMESTAMPTZ
);

CREATE TABLE vouchers (
  id UUID PRIMARY KEY,
  order_id UUID NOT NULL REFERENCES orders(id),
  order_item_id UUID REFERENCES order_items(id),
  version INT NOT NULL DEFAULT 1,
  pdf_key TEXT NOT NULL,                   -- R2 object key
  ticket_artifact_key TEXT,                -- supplier QR/barcode COPIED to R2 (§02.4.1)
  ticket_code TEXT,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  superseded_at TIMESTAMPTZ,
  UNIQUE (order_id, order_item_id, version)
);

CREATE TABLE booking_amendments (
  id UUID PRIMARY KEY,
  order_item_id UUID NOT NULL REFERENCES order_items(id),
  kind TEXT NOT NULL CHECK (kind IN ('date','timeslot','pax','variant')),
  before JSONB NOT NULL, after JSONB NOT NULL,
  fee_inr BIGINT NOT NULL DEFAULT 0,
  status TEXT NOT NULL CHECK (status IN ('requested','confirmed','rejected')),
  requested_by TEXT NOT NULL CHECK (requested_by IN ('customer','agent','ops','supplier')),
  actor_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE cancellation_policies (
  id UUID PRIMARY KEY,
  name TEXT NOT NULL,
  plain_language TEXT NOT NULL,            -- PRD §5.2.12 — not legalese
  tiers JSONB NOT NULL,                    -- [{"hoursBefore":24,"refundPct":100},{"hoursBefore":0,"refundPct":0}]
  supplier_terms JSONB,                    -- what THEY refund US — the gap we absorb
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### 3.8 Coupons, referrals, credits

```sql
CREATE TABLE coupons (
  id UUID PRIMARY KEY,
  code TEXT UNIQUE NOT NULL,
  label TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('percent','fixed','free_addon')),
  value_minor BIGINT NOT NULL,
  max_discount_inr BIGINT,
  min_order_inr BIGINT NOT NULL DEFAULT 0,
  valid_tiers CHAR(1)[], valid_category_ids UUID[], valid_product_ids UUID[],
  first_booking_only BOOLEAN NOT NULL DEFAULT FALSE,
  channel TEXT,
  valid_from TIMESTAMPTZ NOT NULL, valid_to TIMESTAMPTZ NOT NULL,
  usage_cap INT, usage_count INT NOT NULL DEFAULT 0,
  per_user_cap INT NOT NULL DEFAULT 1,
  margin_floor_pct NUMERIC(5,2),           -- AC-CPN-01: coupon may not breach it
  active BOOLEAN NOT NULL DEFAULT TRUE,
  CONSTRAINT coupon_cap_not_exceeded CHECK (usage_cap IS NULL OR usage_count <= usage_cap)
);

CREATE TABLE coupon_redemptions (
  id UUID PRIMARY KEY,
  coupon_id UUID NOT NULL REFERENCES coupons(id),
  order_id UUID NOT NULL REFERENCES orders(id),
  user_id UUID REFERENCES users(id),
  phone_e164 TEXT,
  discount_inr BIGINT NOT NULL,
  redeemed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (coupon_id, order_id)
);
CREATE INDEX ON coupon_redemptions (coupon_id, phone_e164);
```
> `AC-CPN-02` (atomic usage caps) is satisfied by incrementing `usage_count` inside the order transaction with the `coupon_cap_not_exceeded` check constraint. A concurrent over-redemption aborts the transaction rather than being caught by application logic that may have raced.

```sql
CREATE TABLE referrals (
  id UUID PRIMARY KEY,
  referrer_user_id UUID NOT NULL REFERENCES users(id),
  referee_user_id UUID REFERENCES users(id),
  referee_phone TEXT,
  code TEXT NOT NULL,
  order_id UUID REFERENCES orders(id),
  status TEXT NOT NULL DEFAULT 'invited'
    CHECK (status IN ('invited','booked','travelled','credited','blocked','expired')),
  fraud_signals JSONB,                     -- matched device / phone / payment instrument
  credited_at TIMESTAMPTZ,                 -- AC-REF-01: only after travel, no refund
  expires_at TIMESTAMPTZ,
  UNIQUE (code, referee_phone)
);

CREATE TABLE credits (                     -- wallet ledger. V2 feature; schema now, UI later.
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id),
  kind TEXT NOT NULL CHECK (kind IN ('referral','loyalty','goodwill','refund_credit')),
  amount_inr BIGINT NOT NULL,              -- positive = issued, negative = spent
  order_id UUID REFERENCES orders(id),
  expires_at TIMESTAMPTZ,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ON credits (user_id, expires_at);
```
> Credits are a **ledger**, not a balance column. Balance is `SUM(amount_inr)` over unexpired rows. A mutable balance column will drift; a ledger cannot.

### 3.9 Communication, support, reviews

```sql
CREATE TABLE wa_conversations (
  id UUID PRIMARY KEY,
  phone_e164 TEXT NOT NULL,
  user_id UUID REFERENCES users(id),
  bsp_conversation_id TEXT,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','pending','resolved','snoozed')),
  assigned_agent_id UUID REFERENCES admin_users(id),
  intent TEXT,                              -- matches lib/whatsapp.ts WhatsAppIntent
  entry_context JSONB,                      -- SKU, dates, pax passed from the web (AC-WA-01)
  attribution JSONB,                        -- fbclid/fbc/fbp — needed for offline conversions
  csw_expires_at TIMESTAMPTZ,               -- customer service window (§08) — drives message cost
  free_entry_window_expires_at TIMESTAMPTZ, -- 72h from a click-to-WA ad
  first_response_at TIMESTAMPTZ,            -- AC-SUP-01: median < 8 min, measured here
  last_message_at TIMESTAMPTZ,
  converted_order_id UUID REFERENCES orders(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ON wa_conversations (status, last_message_at DESC);
CREATE INDEX ON wa_conversations (phone_e164);
CREATE INDEX ON wa_conversations (assigned_agent_id, status);

CREATE TABLE wa_messages (
  id UUID PRIMARY KEY,
  conversation_id UUID NOT NULL REFERENCES wa_conversations(id),
  bsp_message_id TEXT UNIQUE,
  direction TEXT NOT NULL CHECK (direction IN ('inbound','outbound')),
  kind TEXT NOT NULL CHECK (kind IN ('text','image','document','template','interactive')),
  template_name TEXT, template_category TEXT
    CHECK (template_category IN ('marketing','utility','authentication','service')),
  body TEXT, media_key TEXT,
  billable BOOLEAN NOT NULL DEFAULT FALSE,   -- free inside CSW / free entry window
  cost_minor BIGINT,                          -- per-message pricing since 2025-07-01
  status TEXT CHECK (status IN ('queued','sent','delivered','read','failed')),
  sent_by_agent UUID REFERENCES admin_users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ON wa_messages (conversation_id, created_at);

CREATE TABLE notifications (
  id UUID PRIMARY KEY,
  event TEXT NOT NULL,                      -- BOOKING_CONFIRMED, VOUCHER_READY, ...
  channel TEXT NOT NULL CHECK (channel IN ('whatsapp','email','sms','push')),
  recipient TEXT NOT NULL,
  order_id UUID REFERENCES orders(id),
  user_id UUID REFERENCES users(id),
  template TEXT, payload JSONB,
  status TEXT NOT NULL CHECK (status IN ('queued','sent','delivered','read','failed','suppressed')),
  suppressed_reason TEXT,                   -- 'no_consent' | 'opted_out' | 'quiet_hours'
  provider_id TEXT, cost_minor BIGINT,
  attempt INT NOT NULL DEFAULT 1,
  scheduled_for TIMESTAMPTZ,
  sent_at TIMESTAMPTZ, delivered_at TIMESTAMPTZ, failed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ON notifications (order_id, event);
CREATE INDEX ON notifications (status, scheduled_for) WHERE status = 'queued';

CREATE TABLE support_tickets (
  id UUID PRIMARY KEY,
  reference TEXT UNIQUE NOT NULL,
  order_id UUID REFERENCES orders(id),
  user_id UUID REFERENCES users(id),
  conversation_id UUID REFERENCES wa_conversations(id),
  channel TEXT NOT NULL CHECK (channel IN ('whatsapp','email','phone','web','internal')),
  category TEXT NOT NULL,                   -- pickup_failure | dietary_failure | voucher | refund | ...
  priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('low','normal','high','p1')),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','pending','resolved','closed')),
  assigned_to UUID REFERENCES admin_users(id),
  sla_due_at TIMESTAMPTZ,
  resolved_at TIMESTAMPTZ,
  resolution_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE reviews (
  id UUID PRIMARY KEY,
  order_item_id UUID NOT NULL REFERENCES order_items(id) UNIQUE,  -- AC-REV-01: verified only
  product_id UUID NOT NULL REFERENCES products(id),
  user_id UUID REFERENCES users(id),
  author_display TEXT NOT NULL,             -- first name + city (confirm privacy copy)
  traveller_type TEXT CHECK (traveller_type IN ('family','couple','solo','friends','business')),
  rating SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
  sub_ratings JSONB,                        -- value, guide, food, transport
  title TEXT, body TEXT,
  photo_keys TEXT[] DEFAULT '{}',
  dietary_met BOOLEAN,                      -- the wedge, measured
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','published','rejected')),
  rejection_reason TEXT,
  moderated_by UUID REFERENCES admin_users(id),
  moderated_at TIMESTAMPTZ,                 -- AC-REV-02: within 24h
  ops_alert_sent_at TIMESTAMPTZ,            -- AC-REV-03: ≤2 stars alerts within 1h
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ON reviews (product_id, status, created_at DESC);
CREATE INDEX ON reviews (status) WHERE status = 'pending';

CREATE TABLE leads (                        -- concierge, Tier D quote requests, contact form
  id UUID PRIMARY KEY,
  source TEXT NOT NULL,                     -- concierge | quote_request | contact | whatsapp
  name TEXT, phone_e164 TEXT, email CITEXT,
  product_id UUID REFERENCES products(id),
  dates TEXT, pax JSONB, notes TEXT,
  attribution JSONB,
  status TEXT NOT NULL DEFAULT 'new'
    CHECK (status IN ('new','contacted','quoted','won','lost')),
  assigned_to UUID REFERENCES admin_users(id),
  converted_order_id UUID REFERENCES orders(id),
  sla_due_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE saved_activities (
  user_id UUID REFERENCES users(id),
  product_id UUID REFERENCES products(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, product_id)
);
```

### 3.10 Admin, audit, analytics, infrastructure

```sql
CREATE TABLE admin_users (
  id UUID PRIMARY KEY,
  email CITEXT UNIQUE NOT NULL,
  full_name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  totp_secret_encrypted TEXT,               -- MFA mandatory (AC-SEC-02)
  totp_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended')),
  whatsapp_display_name TEXT, photo_url TEXT,   -- "named agent, real photo" (PRD §1)
  last_login_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

CREATE TABLE roles (
  id UUID PRIMARY KEY, code TEXT UNIQUE NOT NULL, name TEXT NOT NULL
);
CREATE TABLE role_permissions (
  role_id UUID REFERENCES roles(id),
  permission TEXT NOT NULL,                 -- 'orders.refund', 'pricing.override_floor', ...
  PRIMARY KEY (role_id, permission)
);
CREATE TABLE admin_user_roles (
  admin_user_id UUID REFERENCES admin_users(id),
  role_id UUID REFERENCES roles(id),
  PRIMARY KEY (admin_user_id, role_id)
);

CREATE TABLE audit_logs (                   -- AC-ADM-01. IMMUTABLE.
  id BIGSERIAL PRIMARY KEY,
  actor_type TEXT NOT NULL CHECK (actor_type IN ('admin','agent','customer','system','supplier')),
  actor_id UUID,
  action TEXT NOT NULL,                     -- 'order.refund', 'price.update', 'review.publish'
  entity_type TEXT NOT NULL, entity_id TEXT NOT NULL,
  before JSONB, after JSONB,
  reason TEXT,
  ip_hash TEXT, user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ON audit_logs (entity_type, entity_id, created_at DESC);
CREATE INDEX ON audit_logs (actor_id, created_at DESC);
REVOKE UPDATE, DELETE ON audit_logs FROM app_user;   -- append-only at the grant level

CREATE TABLE analytics_events (
  id UUID PRIMARY KEY,
  event_id TEXT NOT NULL,                   -- client-generated; Meta CAPI dedup key
  name TEXT NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  session_id TEXT, anon_id TEXT,
  user_id UUID REFERENCES users(id),
  order_id UUID REFERENCES orders(id),
  product_id UUID REFERENCES products(id),
  rail TEXT, tier CHAR(1),
  value_minor BIGINT, currency TEXT,
  props JSONB NOT NULL DEFAULT '{}',
  source TEXT NOT NULL CHECK (source IN ('client','server')),
  ip_hash TEXT, user_agent TEXT, geo_country TEXT,
  forwarded_ga4 BOOLEAN DEFAULT FALSE,
  forwarded_meta BOOLEAN DEFAULT FALSE,
  forwarded_posthog BOOLEAN DEFAULT FALSE,
  UNIQUE (event_id, source)
) PARTITION BY RANGE (occurred_at);
CREATE INDEX ON analytics_events (name, occurred_at DESC);
CREATE INDEX ON analytics_events (session_id);

CREATE TABLE order_attribution (            -- AC-AN-01: first-touch AND last-touch
  order_id UUID PRIMARY KEY REFERENCES orders(id),
  first_source TEXT, first_medium TEXT, first_campaign TEXT, first_touch_at TIMESTAMPTZ,
  last_source TEXT, last_medium TEXT, last_campaign TEXT, last_touch_at TIMESTAMPTZ,
  fbclid TEXT, fbc TEXT, fbp TEXT, gclid TEXT,
  wa_conversation_id UUID REFERENCES wa_conversations(id),
  uploaded_to_meta_at TIMESTAMPTZ           -- AC-META-02 offline conversions
);

CREATE TABLE idempotency_keys (
  key TEXT PRIMARY KEY,
  scope TEXT NOT NULL,                      -- 'order.create'
  request_hash TEXT NOT NULL,               -- detects key reuse with a DIFFERENT body
  response_status INT, response_body JSONB,
  locked_at TIMESTAMPTZ, completed_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE job_executions (
  id UUID PRIMARY KEY,
  job_type TEXT NOT NULL, dedupe_key TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('running','succeeded','failed','dead')),
  attempt INT NOT NULL DEFAULT 1,
  error TEXT, payload JSONB,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(), finished_at TIMESTAMPTZ,
  UNIQUE (job_type, dedupe_key)
);

CREATE TABLE settings (                     -- AC-SRCH-05, AC-PRC-02: change without deploy
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  updated_by UUID REFERENCES admin_users(id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- seeds: 'ranking.weights', 'pricing.tier_markups', 'sla.manual_confirmation_hours',
--        'whatsapp.business_hours', 'cac.alert_threshold_inr'

CREATE TABLE feature_flags (
  key TEXT PRIMARY KEY,
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  rollout_pct INT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

---

## 4. Order state machine

Enforced in `order.service.ts` and guarded by a check constraint on transitions.

```
        ┌─────────────────┐
        │ pending_payment │──── timeout 30m ───► (expired, cart preserved)
        └────────┬────────┘
                 │ payment webhook: captured
        ┌────────▼────────┐        payment failed
        │      paid       │◄──── retry ──── ┌──────────────────┐
        └────────┬────────┘                 │ payment_failed   │
                 │ FULFIL_ORDER             └──────────────────┘
       ┌─────────┼──────────────┬────────────────────┐
       │         │              │                    │
┌──────▼───┐ ┌───▼───────────┐ ┌▼──────────────────┐ │
│confirmed │ │supplier_      │ │partially_confirmed│ │
│          │ │pending        │ │ (combo, some legs)│ │
└────┬─────┘ └───┬───────────┘ └────┬──────────────┘ │
     │           │ ops confirms     │                │ all legs rejected
     │           ├──────────────────┘                │
     │           │ supplier rejects ─────────────────►│
     │           │                          ┌─────────▼─────────┐
     │           └─────────────────────────►│    cancelled      │
     │                                      └─────────┬─────────┘
     │ service_date passed + no dispute               │ refund completed
┌────▼──────┐                               ┌─────────▼─────────┐
│ completed │                               │     refunded      │
└───────────┘                               └───────────────────┘
```

Rules:
- **Only a verified webhook** moves `pending_payment → paid` (`AC-PAY-01`). No client, no agent, no admin.
- `paid → confirmed` requires **every** `order_item` confirmed.
- `partially_confirmed` exists only for combos and always resolves within the SLA — it is never a terminal state.
- Transitions are idempotent: re-applying a transition already made is a no-op, not an error. Webhooks arrive twice.

---

## 5. Indexing strategy

Beyond the inline indexes:

| Query | Index |
|---|---|
| Search: filter by dietary + category + published | `products_live_idx` + GIN on `dietary` |
| Full-text | GIN on `search_vector`, refreshed by trigger |
| ADP by slug | `products (slug) WHERE deleted_at IS NULL` |
| Availability lookup | `availability_cache (mapping_id, service_date)` unique |
| Capacity lock | PK on `(product, supplier, date, timeslot)` — the lock target |
| Order lookup by ref / phone / email (`AC-ADM-03`, < 5s) | unique on `reference`; btree on `lead_phone`, `lead_email` |
| Daily manifest | `order_items (service_date) WHERE status='confirmed'` |
| Ops queue | `supplier_bookings (status, sla_due_at) WHERE` non-terminal |
| Agent inbox | `wa_conversations (status, last_message_at DESC)` |
| Moderation queue | `reviews (status) WHERE status='pending'` |
| Abandoned carts | `carts (last_activity_at) WHERE` unconverted, unsent |
| GMV by tier / rail | `order_items (tier_snapshot)`, `orders (rail, placed_at)` |
| Analytics scans | monthly partitions on `occurred_at` |

**Do not over-index at launch.** Every index costs write throughput and, more importantly, review attention. Add from real `pg_stat_statements` output after a month of traffic.

---

## 6. Constraints that carry business rules

The ones worth defending in review, because each replaces application logic that could be forgotten:

| Constraint | Prevents |
|---|---|
| `capacity_not_oversold` | Overselling our own inventory — "the worst failure mode in this product" |
| `orders_idem` (partial unique) | Duplicate orders from a double-submitted checkout |
| `payment_events (gateway, gateway_event_id)` unique | Processing the same webhook twice |
| `supplier_bookings (idempotency_key)` unique | Double-booking a supplier |
| `coupon_cap_not_exceeded` | Concurrent redemption past the cap (`AC-CPN-02`) |
| `prices_one_current` (partial unique) | Two "current" prices for one SKU/pax combination |
| `order_totals_consistent` | Arithmetic drift between subtotal, discount, tax and total |
| `reviews.order_item_id` unique | More than one review per booking (`AC-REV-01`) |
| `price_change_log` override check | An out-of-floor price with no logged reason (`AC-PRC-01`) |
| `users_identity_present` | A user record with no way to reach them |

---

## 7. Soft delete and audit

**Soft delete** (`deleted_at`) on: products, variants, addons, media, categories, collections, attractions, combos, suppliers, users, traveller_profiles, admin_users.

**Never soft-deleted, never deleted:** orders, order_items, payments, payment_events, refunds, audit_logs, tax_lines, consents. These are financial and legal records.

Every read path filters `deleted_at IS NULL` — implemented once, in the repository layer, so it cannot be forgotten in a query written later.

**Audit strategy.** Write to `audit_logs` on:
- every admin/agent mutation (`AC-ADM-01`) — actor, timestamp, before, after
- every price change (also to `price_change_log`, which carries margin context)
- every refund, cancellation, amendment
- every permission or role change
- every override of a guardrail (margin floor, availability force, manual price)

`audit_logs` is append-only at the **grant** level, not just by convention. The application role has no `UPDATE` or `DELETE` on it. That is the difference between an audit log and a log.

---

## 8. Data retention

| Data | Retention | Basis |
|---|---|---|
| Orders, payments, invoices, tax lines | **7 years** | Indian financial record-keeping (PRD §16). **[VERIFY with CA]** |
| `payment_events` raw payloads | 7 years | Dispute and chargeback evidence |
| `audit_logs` | 7 years | |
| Vouchers and ticket artifacts (R2) | 3 years after travel | Gate disputes; then delete |
| `analytics_events` | 24 months hot, then aggregate and drop raw | Cost, and DPDP minimisation |
| `wa_messages` bodies | 24 months | Support history vs. minimisation |
| `sessions` | 90 days after expiry | |
| `idempotency_keys` | 30 days | |
| `quotes` (unconsumed) | 90 days | Price-lock cost analysis |
| `carts` (unconverted) | 12 months | |
| Deletion requests (`AC-ACC-03`) | **Anonymise, do not delete** | Financial records must survive; PII within them is replaced with tokens and the `users` row is scrubbed |

**The deletion pattern that matters:** a DPDP deletion request cannot delete an order, because you are legally required to keep the financial record. The correct handling is: scrub `users`, scrub `guests`, replace `orders.lead_name` / `lead_email` / `lead_phone` with `[deleted-{token}]`, drop review author names, delete media, and record the request in `audit_logs`. Get this reviewed with the legal opinion (Blocker B2 / §13).

---

## 9. Migration and seeding

- **Prisma Migrate**, forward-only. Every migration reviewed as SQL before it runs against staging.
- Constraints Prisma cannot express (partial unique indexes, `EXCLUDE`, check constraints, grants) go in raw SQL migrations. **These are the ones protecting money — they are not optional extras.**
- Seed data: roles and permissions, `margin_floors`, default `price_rules`, `settings` (ranking weights ported from `src/lib/search.ts`), `cancellation_policies`, and the 26 SKUs migrated from `src/lib/data/activities.ts` by a one-off script.
- **Keep `src/lib/data/*.ts` as test fixtures after the migration.** They are a well-formed, hand-checked dataset and will make the integration test suite far better than anything generated.
