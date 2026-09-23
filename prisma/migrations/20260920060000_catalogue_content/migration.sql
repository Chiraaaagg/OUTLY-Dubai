-- AlterTable
ALTER TABLE "products" ADD COLUMN     "content" JSONB NOT NULL DEFAULT '{}',
ADD COLUMN     "dietary" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "duration_minutes" INTEGER,
ADD COLUMN     "is_private" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "location" TEXT,
ADD COLUMN     "pickup_included" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "price_from_aed" BIGINT,
ADD COLUMN     "price_from_inr" BIGINT,
ADD COLUMN     "published_at" TIMESTAMPTZ(6),
ADD COLUMN     "rating" DECIMAL(2,1),
ADD COLUMN     "review_count" INTEGER,
ADD COLUMN     "seo_description" TEXT,
ADD COLUMN     "seo_title" TEXT,
ADD COLUMN     "subtitle" TEXT,
ADD COLUMN     "suitability" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 1;

-- CreateTable
CREATE TABLE "product_versions" (
    "id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "content" JSONB NOT NULL,
    "status" TEXT NOT NULL,
    "actor_id" UUID,
    "reason" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "product_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "categories" (
    "id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "short_name" TEXT NOT NULL,
    "emoji" TEXT NOT NULL DEFAULT '',
    "tagline" TEXT NOT NULL DEFAULT '',
    "intro" TEXT NOT NULL DEFAULT '',
    "hero_image" TEXT NOT NULL DEFAULT '',
    "faqs" JSONB NOT NULL DEFAULT '[]',
    "related_slugs" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "featured_slugs" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "sort_order" INTEGER NOT NULL DEFAULT 100,
    "status" TEXT NOT NULL DEFAULT 'published',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "import_batches" (
    "id" UUID NOT NULL,
    "source" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'previewed',
    "file_name" TEXT,
    "source_ref" TEXT,
    "mapping" JSONB NOT NULL DEFAULT '{}',
    "rows_total" INTEGER NOT NULL DEFAULT 0,
    "rows_ok" INTEGER NOT NULL DEFAULT 0,
    "rows_failed" INTEGER NOT NULL DEFAULT 0,
    "errors" JSONB NOT NULL DEFAULT '[]',
    "preview" JSONB NOT NULL DEFAULT '[]',
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "applied_at" TIMESTAMPTZ(6),
    "reverted_at" TIMESTAMPTZ(6),

    CONSTRAINT "import_batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "import_batch_items" (
    "id" UUID NOT NULL,
    "batch_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "action" TEXT NOT NULL,
    "before_version" INTEGER,
    "after_version" INTEGER NOT NULL,
    "slug" TEXT NOT NULL,

    CONSTRAINT "import_batch_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "product_versions_product_version_idx" ON "product_versions"("product_id", "version" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "product_versions_product_id_version_key" ON "product_versions"("product_id", "version");

-- CreateIndex
CREATE UNIQUE INDEX "categories_slug_key" ON "categories"("slug");

-- CreateIndex
CREATE INDEX "categories_status_sort_idx" ON "categories"("status", "sort_order");

-- CreateIndex
CREATE INDEX "import_batches_created_idx" ON "import_batches"("created_at" DESC);

-- CreateIndex
CREATE INDEX "import_batch_items_batch_idx" ON "import_batch_items"("batch_id");

-- CreateIndex
CREATE INDEX "products_category_status_idx" ON "products"("category_slug", "status");

-- CreateIndex
CREATE INDEX "products_status_deleted_idx" ON "products"("status", "deleted_at");

-- AddForeignKey
ALTER TABLE "product_versions" ADD CONSTRAINT "product_versions_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "import_batch_items" ADD CONSTRAINT "import_batch_items_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "import_batches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "import_batch_items" ADD CONSTRAINT "import_batch_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Full-text search projection (not in the Prisma model: generated columns are
-- unsupported there). Weighted: title A, subtitle/location B, keywords C.
ALTER TABLE "products" ADD COLUMN "search_vector" tsvector
  GENERATED ALWAYS AS (
    setweight(to_tsvector('english', coalesce("title", '')), 'A') ||
    setweight(to_tsvector('english', coalesce("subtitle", '')), 'B') ||
    setweight(to_tsvector('english', coalesce("location", '')), 'B') ||
    setweight(to_tsvector('english', coalesce("seo_title", '')), 'C') ||
    setweight(to_tsvector('english', coalesce("seo_description", '')), 'C')
  ) STORED;

CREATE INDEX "products_search_vector_idx" ON "products" USING GIN ("search_vector");
CREATE INDEX "products_dietary_idx" ON "products" USING GIN ("dietary");
CREATE INDEX "products_suitability_idx" ON "products" USING GIN ("suitability");

-- Import batches / product versions are history: block UPDATE/DELETE on versions.
CREATE OR REPLACE FUNCTION product_versions_immutable() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'product_versions rows are immutable';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER product_versions_no_update
  BEFORE UPDATE OR DELETE ON "product_versions"
  FOR EACH ROW EXECUTE FUNCTION product_versions_immutable();

-- Status guard: only the three lifecycle states.
ALTER TABLE "products" ADD CONSTRAINT "products_status_check" CHECK ("status" IN ('draft', 'published', 'archived'));
ALTER TABLE "categories" ADD CONSTRAINT "categories_status_check" CHECK ("status" IN ('draft', 'published', 'archived'));
ALTER TABLE "import_batches" ADD CONSTRAINT "import_batches_status_check" CHECK ("status" IN ('previewed', 'applied', 'reverted', 'failed'));
ALTER TABLE "import_batches" ADD CONSTRAINT "import_batches_source_check" CHECK ("source" IN ('manual', 'csv', 'sheet', 'doc', 'bulk'));
ALTER TABLE "import_batch_items" ADD CONSTRAINT "import_batch_items_action_check" CHECK ("action" IN ('create', 'update'));
