-- The app now serves one business with one login: tenant columns, memberships and roles are removed.
-- Hand-written so existing data is kept: the business row is renamed, not recreated.

DO $$
BEGIN
  IF (SELECT count(*) FROM "organizations") > 1 THEN
    RAISE EXCEPTION 'This database holds more than one business. Keep only one before applying this migration.';
  END IF;
END $$;

-- Memberships go away; a user whose access was turned off stays unable to log in.
UPDATE "users" SET "is_active" = false
WHERE NOT EXISTS (SELECT 1 FROM "memberships" m WHERE m."user_id" = "users"."id" AND m."is_active");

-- DropForeignKey
ALTER TABLE "memberships" DROP CONSTRAINT "memberships_user_id_fkey";

-- DropForeignKey
ALTER TABLE "memberships" DROP CONSTRAINT "memberships_organization_id_fkey";

-- DropForeignKey
ALTER TABLE "sessions" DROP CONSTRAINT "sessions_organization_id_fkey";

-- DropForeignKey
ALTER TABLE "products" DROP CONSTRAINT "products_organization_id_fkey";

-- DropForeignKey
ALTER TABLE "product_variants" DROP CONSTRAINT "product_variants_organization_id_fkey";

-- DropForeignKey
ALTER TABLE "warehouses" DROP CONSTRAINT "warehouses_organization_id_fkey";

-- DropForeignKey
ALTER TABLE "stock_levels" DROP CONSTRAINT "stock_levels_organization_id_fkey";

-- DropForeignKey
ALTER TABLE "stock_movements" DROP CONSTRAINT "stock_movements_organization_id_fkey";

-- DropForeignKey
ALTER TABLE "document_sequences" DROP CONSTRAINT "document_sequences_organization_id_fkey";

-- DropForeignKey
ALTER TABLE "suppliers" DROP CONSTRAINT "suppliers_organization_id_fkey";

-- DropForeignKey
ALTER TABLE "purchases" DROP CONSTRAINT "purchases_organization_id_fkey";

-- DropForeignKey
ALTER TABLE "sales_channels" DROP CONSTRAINT "sales_channels_organization_id_fkey";

-- DropForeignKey
ALTER TABLE "dispatches" DROP CONSTRAINT "dispatches_organization_id_fkey";

-- DropForeignKey
ALTER TABLE "sales_returns" DROP CONSTRAINT "sales_returns_organization_id_fkey";

-- DropIndex
DROP INDEX "products_organization_id_name_idx";

-- DropIndex
DROP INDEX "products_organization_id_category_idx";

-- DropIndex
DROP INDEX "product_variants_organization_id_barcode_idx";

-- DropIndex
DROP INDEX "product_variants_organization_id_sku_key";

-- DropIndex
DROP INDEX "warehouses_organization_id_name_key";

-- DropIndex
DROP INDEX "stock_levels_organization_id_idx";

-- DropIndex
DROP INDEX "stock_movements_organization_id_created_at_idx";

-- DropIndex
DROP INDEX "suppliers_organization_id_name_key";

-- DropIndex
DROP INDEX "purchases_organization_id_purchase_date_idx";

-- DropIndex
DROP INDEX "purchases_organization_id_number_key";

-- DropIndex
DROP INDEX "sales_channels_organization_id_code_key";

-- DropIndex
DROP INDEX "dispatches_organization_id_dispatch_date_idx";

-- DropIndex
DROP INDEX "dispatches_organization_id_order_number_idx";

-- DropIndex
DROP INDEX "dispatches_organization_id_number_key";

-- DropIndex
DROP INDEX "sales_returns_organization_id_return_date_idx";

-- DropIndex
DROP INDEX "sales_returns_organization_id_order_number_idx";

-- DropIndex
DROP INDEX "sales_returns_organization_id_number_key";

-- AlterTable
ALTER TABLE "sessions" DROP COLUMN "organization_id";

-- AlterTable
ALTER TABLE "products" DROP COLUMN "organization_id";

-- AlterTable
ALTER TABLE "product_variants" DROP COLUMN "organization_id";

-- AlterTable
ALTER TABLE "warehouses" DROP COLUMN "organization_id";

-- AlterTable
ALTER TABLE "stock_levels" DROP COLUMN "organization_id";

-- AlterTable
ALTER TABLE "stock_movements" DROP COLUMN "organization_id";

-- AlterTable
ALTER TABLE "document_sequences" DROP CONSTRAINT "document_sequences_pkey",
DROP COLUMN "organization_id",
ADD CONSTRAINT "document_sequences_pkey" PRIMARY KEY ("key");

-- AlterTable
ALTER TABLE "suppliers" DROP COLUMN "organization_id";

-- AlterTable
ALTER TABLE "purchases" DROP COLUMN "organization_id";

-- AlterTable
ALTER TABLE "sales_channels" DROP COLUMN "organization_id";

-- AlterTable
ALTER TABLE "dispatches" DROP COLUMN "organization_id";

-- AlterTable
ALTER TABLE "sales_returns" DROP COLUMN "organization_id";

-- RenameTable: organizations -> businesses, keeping the business's details and settings
DROP INDEX "organizations_slug_key";
ALTER TABLE "organizations" DROP COLUMN "slug";
ALTER TABLE "organizations" RENAME TO "businesses";
ALTER TABLE "businesses" RENAME CONSTRAINT "organizations_pkey" TO "businesses_pkey";

-- DropTable
DROP TABLE "memberships";

-- DropEnum
DROP TYPE "Role";

-- CreateTable
CREATE TABLE "password_reset_tokens" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "used_at" TIMESTAMP(3),
    "ip_address" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" UUID,

    CONSTRAINT "password_reset_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "password_reset_tokens_token_hash_key" ON "password_reset_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "password_reset_tokens_user_id_created_at_idx" ON "password_reset_tokens"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "products_name_idx" ON "products"("name");

-- CreateIndex
CREATE INDEX "products_category_idx" ON "products"("category");

-- CreateIndex
CREATE UNIQUE INDEX "product_variants_sku_key" ON "product_variants"("sku");

-- CreateIndex
CREATE INDEX "product_variants_barcode_idx" ON "product_variants"("barcode");

-- CreateIndex
CREATE UNIQUE INDEX "warehouses_name_key" ON "warehouses"("name");

-- CreateIndex
CREATE INDEX "stock_movements_created_at_idx" ON "stock_movements"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "suppliers_name_key" ON "suppliers"("name");

-- CreateIndex
CREATE UNIQUE INDEX "purchases_number_key" ON "purchases"("number");

-- CreateIndex
CREATE INDEX "purchases_purchase_date_idx" ON "purchases"("purchase_date");

-- CreateIndex
CREATE UNIQUE INDEX "sales_channels_code_key" ON "sales_channels"("code");

-- CreateIndex
CREATE UNIQUE INDEX "dispatches_number_key" ON "dispatches"("number");

-- CreateIndex
CREATE INDEX "dispatches_dispatch_date_idx" ON "dispatches"("dispatch_date");

-- CreateIndex
CREATE INDEX "dispatches_order_number_idx" ON "dispatches"("order_number");

-- CreateIndex
CREATE UNIQUE INDEX "sales_returns_number_key" ON "sales_returns"("number");

-- CreateIndex
CREATE INDEX "sales_returns_return_date_idx" ON "sales_returns"("return_date");

-- CreateIndex
CREATE INDEX "sales_returns_order_number_idx" ON "sales_returns"("order_number");

-- AddForeignKey
ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "password_reset_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
