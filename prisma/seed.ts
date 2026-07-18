import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client';
import { faker } from '@faker-js/faker';
import * as argon2 from 'argon2';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const TEST_PASSWORD = 'Test1234!';

const ZONE_CENTERS = [
  { lat: 14.7676, lng: -88.7756 },
  { lat: 14.0723, lng: -87.1921 },
  { lat: 15.5049, lng: -88.025 },
];

function jitter(value: number, spread = 0.03) {
  return value + (Math.random() - 0.5) * spread;
}

async function seedPassengers(count: number, passwordHash: string) {
  const data = Array.from({ length: count }).map((_, i) => ({
    name: faker.person.fullName(),
    email: `passenger${i + 1}@test.com`,
    phone: faker.phone.number(),
    passwordHash,
    role: 'passenger' as const,
  }));

  await prisma.user.createMany({ data, skipDuplicates: true });

  const passengers = await prisma.user.findMany({
    where: { role: 'passenger' },
    include: { wallet: true },
  });
  for (const p of passengers) {
    if (!p.wallet) {
      await prisma.wallet.create({ data: { userId: p.id, balance: 500 } });
    }
  }
}

async function seedDrivers(count: number, passwordHash: string) {
  for (let i = 0; i < count; i++) {
    const email = `driver${i + 1}@test.com`;

    const user = await prisma.user.upsert({
      where: { email },
      update: {},
      create: {
        name: faker.person.fullName(),
        email,
        phone: faker.phone.number(),
        passwordHash,
        role: 'driver',
        wallet: { create: { balance: 0 } },
      },
    });

    const existingDriver = await prisma.driver.findUnique({
      where: { userId: user.id },
    });
    if (existingDriver) continue;

    const driver = await prisma.driver.create({
      data: {
        userId: user.id,
        vehicleType: faker.helpers.arrayElement(['car', 'motorcycle']),
        licenseNumber: faker.string.alphanumeric(8).toUpperCase(),
        verificationStatus: 'approved',
        available: true,
        approvedAt: new Date(),
        vehicles: {
          create: {
            brand: faker.vehicle.manufacturer(),
            model: faker.vehicle.model(),
            year: faker.number.int({ min: 2010, max: 2025 }),
            color: faker.vehicle.color(),
            plate: faker.string.alphanumeric(6).toUpperCase(),
          },
        },
      },
    });

    const center = faker.helpers.arrayElement(ZONE_CENTERS);
    await prisma.locationTracking.create({
      data: {
        driverId: driver.id,
        lat: jitter(center.lat),
        lng: jitter(center.lng),
      },
    });
  }
}

async function main() {
  const passwordHash = await argon2.hash(TEST_PASSWORD, {
    type: argon2.argon2id,
  });

  await seedPassengers(50, passwordHash);
  await seedDrivers(20, passwordHash);

  console.log('Listo. Credenciales de prueba:');
  console.log('  Pasajero: passenger1@test.com / Test1234!');
  console.log('  Conductor: driver1@test.com / Test1234!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
