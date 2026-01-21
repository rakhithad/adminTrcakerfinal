-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AmendmentType" ADD VALUE 'SUPPLIER_SETTLEMENT';
ALTER TYPE "AmendmentType" ADD VALUE 'SUPPLIER_PAYABLE_SETTLE';

-- AlterEnum
ALTER TYPE "CommissionType" ADD VALUE 'ADJUSTMENT';

-- AlterTable
ALTER TABLE "commission_ledger" ADD COLUMN     "description" TEXT;
