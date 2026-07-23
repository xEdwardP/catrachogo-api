import 'dotenv/config';
import * as argon2 from 'argon2';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function main() {
  const passwordHash = await argon2.hash(crypto.randomUUID(), { type: argon2.argon2id });

  const platformUser = await prisma.user.upsert({
    where: { email: 'platform@catrachogo.internal' },
    update: {},
    create: {
      name: 'CatrachoGo (Plataforma)',
      email: 'platform@catrachogo.internal',
      phone: null,
      passwordHash,
      role: 'admin',
      isActive: false,
      wallet: { create: { balance: 0 } },
    },
    include: { wallet: true },
  });

  console.log('Usuario de plataforma listo. Agrega esto a tu .env:');
  console.log(`PLATFORM_USER_ID="${platformUser.id}"`);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());