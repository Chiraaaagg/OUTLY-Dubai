-- History rows may never be rewritten, but they go with their product when a
-- product row is physically removed (test cleanup, GDPR purge). UPDATE stays blocked.
DROP TRIGGER IF EXISTS product_versions_no_update ON "product_versions";
CREATE TRIGGER product_versions_no_update
  BEFORE UPDATE ON "product_versions"
  FOR EACH ROW EXECUTE FUNCTION product_versions_immutable();

ALTER TABLE "product_versions" DROP CONSTRAINT "product_versions_product_id_fkey";
ALTER TABLE "product_versions" ADD CONSTRAINT "product_versions_product_id_fkey"
  FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "import_batch_items" DROP CONSTRAINT "import_batch_items_product_id_fkey";
ALTER TABLE "import_batch_items" ADD CONSTRAINT "import_batch_items_product_id_fkey"
  FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "import_batch_items" DROP CONSTRAINT "import_batch_items_batch_id_fkey";
ALTER TABLE "import_batch_items" ADD CONSTRAINT "import_batch_items_batch_id_fkey"
  FOREIGN KEY ("batch_id") REFERENCES "import_batches"("id") ON DELETE CASCADE ON UPDATE CASCADE;
