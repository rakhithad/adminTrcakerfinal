-- CreateEnum
CREATE TYPE "AmendmentType" AS ENUM ('WRITE_OFF', 'REVENUE_ADJUSTMENT', 'REVERSAL');

-- CreateTable
CREATE TABLE "booking_amendments" (
    "id" SERIAL NOT NULL,
    "booking_id" INTEGER NOT NULL,
    "user_id" TEXT NOT NULL,
    "type" "AmendmentType" NOT NULL DEFAULT 'WRITE_OFF',
    "property_name" TEXT NOT NULL,
    "old_value" DOUBLE PRECISION NOT NULL,
    "new_value" DOUBLE PRECISION NOT NULL,
    "difference" DOUBLE PRECISION NOT NULL,
    "reason" TEXT NOT NULL,
    "is_reversed" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "booking_amendments_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "booking_amendments" ADD CONSTRAINT "booking_amendments_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_amendments" ADD CONSTRAINT "booking_amendments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
