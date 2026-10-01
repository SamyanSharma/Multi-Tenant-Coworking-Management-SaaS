-- FIXED VERSION of apps/backend/prisma/migrations/20260818163050_add_stripe_connect_fields/migration.sql
--
-- The original file duplicated work already done by the earlier
-- 20260815063622_add_bookable_type_enum migration (re-created the
-- "BookableType" enum type and re-created 5 indexes that already
-- exist), which fails with "type BookableType already exists" (Postgres
-- 42710) on any database that already has that earlier migration
-- applied -- i.e. every real environment, every time. This version only
-- contains the genuinely new Stage 6 (Stripe) work.

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('UNPAID', 'PENDING', 'PAID', 'FAILED');

-- AlterTable
ALTER TABLE "Booking" ADD COLUMN     "amountCents" INTEGER,
ADD COLUMN     "paymentStatus" "PaymentStatus" NOT NULL DEFAULT 'UNPAID',
ADD COLUMN     "stripePaymentIntentId" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "stripeAccountId" TEXT,
ADD COLUMN     "stripeOnboardingComplete" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE UNIQUE INDEX "Booking_stripePaymentIntentId_key" ON "Booking"("stripePaymentIntentId");