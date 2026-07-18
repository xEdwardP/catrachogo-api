import 'dotenv/config';
import * as argon2 from 'argon2';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function main() {
  const passwordHash = await argon2.hash(process.env.ADMIN_PASSWORD!, {
    type: argon2.argon2id,
  });
  await prisma.user.upsert({
    where: { email: process.env.ADMIN_EMAIL! },
    update: {},
    create: {
      name: 'Administrador',
      email: process.env.ADMIN_EMAIL!,
      phone: '00000000',
      passwordHash,
      role: 'admin',
      wallet: { create: { balance: 0 } },
    },
  });
}
main().finally(() => prisma.$disconnect());
