-- DropIndex
DROP INDEX "customer_sessions_expires_idx";

-- DropIndex
DROP INDEX "otp_challenges_expires_idx";

-- CreateTable
CREATE TABLE "image_assets" (
    "key" TEXT NOT NULL,
    "query" TEXT NOT NULL,
    "photos" JSONB NOT NULL DEFAULT '[]',
    "fetched_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "image_assets_pkey" PRIMARY KEY ("key")
);
