import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function main() {
  await prisma.fareZone.createMany({
    data: [
      { zoneName: 'Santa Rosa de Copán', baseFare: 20, farePerKm: 8, centerLat: 14.7676, centerLng: -88.7756 },
      { zoneName: 'Tegucigalpa', baseFare: 25, farePerKm: 9, centerLat: 14.0723, centerLng: -87.1921 },
      { zoneName: 'San Pedro Sula', baseFare: 25, farePerKm: 9, centerLat: 15.5049, centerLng: -88.0250 },
      { zoneName: 'Resto de Honduras', baseFare: 20, farePerKm: 7, centerLat: 14.6349, centerLng: -86.8408 },
    ],
  });
}
main().finally(() => prisma.$disconnect());