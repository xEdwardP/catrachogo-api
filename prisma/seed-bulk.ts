import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client';
import { faker } from '@faker-js/faker';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function seedTrips(
  count: number,
  passengerIds: string[],
  driverIds: string[],
) {
  const batchSize = 1000;
  for (let i = 0; i < count; i += batchSize) {
    const batch = Array.from({ length: Math.min(batchSize, count - i) }).map(
      () => {
        const requestedAt = faker.date.past({ years: 1 });
        return {
          passengerId: faker.helpers.arrayElement(passengerIds),
          driverId: faker.helpers.arrayElement(driverIds),
          originLat: faker.location.latitude({ min: 13, max: 16 }),
          originLng: faker.location.longitude({ min: -89, max: -84 }),
          originAddress: faker.location.streetAddress(),
          destinationLat: faker.location.latitude({ min: 13, max: 16 }),
          destinationLng: faker.location.longitude({ min: -89, max: -84 }),
          destinationAddress: faker.location.streetAddress(),
          status: 'completed' as const,
          distanceKm: faker.number.float({
            min: 1,
            max: 15,
            fractionDigits: 2,
          }),
          fare: faker.number.float({ min: 20, max: 200, fractionDigits: 2 }),
          requestedAt,
          startedAt: requestedAt,
          completedAt: faker.date.soon({ days: 1, refDate: requestedAt }),
        };
      },
    );
    await prisma.trip.createMany({ data: batch });
    console.log(
      `Trips insertados: ${Math.min(i + batchSize, count)} / ${count}`,
    );
  }
}

async function main() {
  const passengers = await prisma.user.findMany({
    where: { role: 'passenger' },
    select: { id: true },
  });
  const drivers = await prisma.driver.findMany({ select: { id: true } });

  if (passengers.length === 0 || drivers.length === 0) {
    throw new Error(
      'Necesitas pasajeros y conductores ya sembrados antes de correr este script (usa prisma/seed.ts primero).',
    );
  }

  await seedTrips(
    25_000,
    passengers.map((p) => p.id),
    drivers.map((d) => d.id),
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
