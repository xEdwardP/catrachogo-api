-- CreateEnum
CREATE TYPE "IncidentReportCategory" AS ENUM ('safety', 'driver_behavior', 'vehicle_condition', 'payment', 'other');

-- CreateEnum
CREATE TYPE "IncidentReportStatus" AS ENUM ('pending', 'reviewed');

-- CreateTable
CREATE TABLE "incident_reports" (
    "id" TEXT NOT NULL,
    "reporter_id" TEXT NOT NULL,
    "trip_id" TEXT,
    "reported_driver_id" TEXT,
    "category" "IncidentReportCategory" NOT NULL,
    "description" TEXT NOT NULL,
    "status" "IncidentReportStatus" NOT NULL DEFAULT 'pending',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "incident_reports_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "incident_reports" ADD CONSTRAINT "incident_reports_reporter_id_fkey" FOREIGN KEY ("reporter_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incident_reports" ADD CONSTRAINT "incident_reports_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "trips"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incident_reports" ADD CONSTRAINT "incident_reports_reported_driver_id_fkey" FOREIGN KEY ("reported_driver_id") REFERENCES "drivers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
