/*
  Warnings:

  - A unique constraint covering the columns `[google_id]` on the table `users` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `id_back_url` to the `drivers` table without a default value. This is not possible if the table is not empty.
  - Added the required column `id_front_url` to the `drivers` table without a default value. This is not possible if the table is not empty.
  - Added the required column `selfie_with_id_url` to the `drivers` table without a default value. This is not possible if the table is not empty.
  - Added the required column `vehicle_registration_url` to the `drivers` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "drivers" ADD COLUMN     "id_back_url" TEXT NOT NULL,
ADD COLUMN     "id_front_url" TEXT NOT NULL,
ADD COLUMN     "selfie_with_id_url" TEXT NOT NULL,
ADD COLUMN     "vehicle_registration_url" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "google_id" TEXT,
ADD COLUMN     "profile_photo_url" TEXT,
ALTER COLUMN "password_hash" DROP NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "users_google_id_key" ON "users"("google_id");
