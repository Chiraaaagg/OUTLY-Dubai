-- AlterTable
ALTER TABLE "inquiries" ADD COLUMN     "customer_id" UUID;

-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "customer_id" UUID;

-- CreateTable
CREATE TABLE "customers" (
    "id" UUID NOT NULL,
    "phone_e164" TEXT NOT NULL,
    "email" TEXT,
    "full_name" TEXT,
    "dietary" TEXT,
    "hotel" TEXT,
    "locale" TEXT NOT NULL DEFAULT 'en-IN',
    "preferred_currency" "currency" NOT NULL DEFAULT 'INR',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_login_at" TIMESTAMPTZ(6),
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "customers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_sessions" (
    "id" UUID NOT NULL,
    "customer_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "user_agent" TEXT,
    "ip_hash" TEXT,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "revoked_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "customer_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "otp_challenges" (
    "id" UUID NOT NULL,
    "phone_e164" TEXT NOT NULL,
    "code_hash" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "consumed_at" TIMESTAMPTZ(6),
    "ip_hash" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "otp_challenges_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "customers_phone_e164_key" ON "customers"("phone_e164");

-- CreateIndex
CREATE UNIQUE INDEX "customer_sessions_token_hash_key" ON "customer_sessions"("token_hash");

-- CreateIndex
CREATE INDEX "customer_sessions_customer_idx" ON "customer_sessions"("customer_id", "revoked_at");

-- CreateIndex
CREATE INDEX "otp_challenges_phone_idx" ON "otp_challenges"("phone_e164", "created_at" DESC);

-- CreateIndex
CREATE INDEX "inquiries_customer_idx" ON "inquiries"("customer_id");

-- CreateIndex
CREATE INDEX "orders_customer_idx" ON "orders"("customer_id");

-- AddForeignKey
ALTER TABLE "customer_sessions" ADD CONSTRAINT "customer_sessions_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inquiries" ADD CONSTRAINT "inquiries_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ============================================================================
-- Hand-written section (reviewed as SQL, §05.9). Additive only.
-- ============================================================================

-- otp_challenges.attempts is a counter the service increments atomically; it
-- can never be negative, and a consumed challenge must have been issued first.
ALTER TABLE "otp_challenges"
  ADD CONSTRAINT otp_challenge_attempts_non_negative CHECK (attempts >= 0),
  ADD CONSTRAINT otp_challenge_consumed_after_created CHECK (consumed_at IS NULL OR consumed_at >= created_at);

-- Sessions and challenges are pruned opportunistically by expiry (no cron).
CREATE INDEX IF NOT EXISTS otp_challenges_expires_idx ON "otp_challenges" ("expires_at");
CREATE INDEX IF NOT EXISTS customer_sessions_expires_idx ON "customer_sessions" ("expires_at");
