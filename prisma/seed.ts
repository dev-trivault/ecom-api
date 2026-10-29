/**
 * Sets up the business and its one login, plus (in development) some demo products.
 * There is no sign-up in the app: this is the only way the login is created.
 * Safe to run more than once: it does nothing once the business exists.
 *
 *   npm run db:seed
 *
 * Production: set SEED_OWNER_EMAIL / SEED_OWNER_PASSWORD / SEED_OWNER_NAME / SEED_BUSINESS_NAME
 * and SEED_DEMO=false, run once, then log in and change the password.
 */
import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import bcrypt from 'bcryptjs';
import { PrismaClient } from '../src/generated/prisma/client.js';

const DEFAULT_CHANNELS = [
  { code: 'MEESHO', name: 'Meesho', color: '#9B1FE8' },
  { code: 'FLIPKART', name: 'Flipkart', color: '#2874F0' },
  { code: 'AMAZON', name: 'Amazon', color: '#FF9900' },
  { code: 'MYNTRA', name: 'Myntra', color: '#FF3F6C' },
];

const isProduction = process.env.NODE_ENV === 'production';
const email = (process.env.SEED_OWNER_EMAIL ?? (isProduction ? '' : 'owner@ecom.local')).trim().toLowerCase();
const password = process.env.SEED_OWNER_PASSWORD ?? (isProduction ? '' : 'Owner@12345');
const ownerName = process.env.SEED_OWNER_NAME ?? 'Owner';
const businessName = process.env.SEED_BUSINESS_NAME ?? 'My Business';
const withDemo = (process.env.SEED_DEMO ?? (isProduction ? 'false' : 'true')) === 'true';

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });

async function main() {
  const existing = await prisma.business.findFirst({ select: { name: true } });
  if (existing) {
    console.log(`The business "${existing.name}" is already set up, nothing to do.`);
    return;
  }
  if (!email || password.length < 8) {
    throw new Error('Set SEED_OWNER_EMAIL and SEED_OWNER_PASSWORD (min 8 characters) to seed production.');
  }

  await prisma.$transaction(async (tx) => {
    await tx.business.create({ data: { name: businessName } });
    await tx.user.create({ data: { email, name: ownerName, passwordHash: await bcrypt.hash(password, 12) } });
    await tx.warehouse.create({ data: { name: 'Main Warehouse', isDefault: true } });
    await tx.salesChannel.createMany({ data: DEFAULT_CHANNELS.map((c, i) => ({ ...c, sortOrder: i })) });
    if (withDemo) await seedDemoCatalog(tx);
  });

  console.log(`Created business "${businessName}" with the login ${email}${withDemo ? ' and demo products' : ''}.`);
  if (!isProduction) console.log(`Log in with ${email} / ${password}`);
}

type Tx = Parameters<Parameters<PrismaClient['$transaction']>[0]>[0];

async function seedDemoCatalog(tx: Tx) {
  const warehouse = await tx.warehouse.findFirstOrThrow({ where: { isDefault: true } });
  const catalog = [
    {
      name: 'Cotton Printed Kurta',
      category: 'Kurta',
      sizes: ['S', 'M', 'L', 'XL'],
      color: 'Blue',
      cost: 220,
      price: 549,
    },
    {
      name: 'Rayon Palazzo Pants',
      category: 'Bottomwear',
      sizes: ['M', 'L', 'XL'],
      color: 'Black',
      cost: 140,
      price: 399,
    },
    { name: 'Steel Water Bottle 1L', category: 'Home', sizes: [null], color: null, cost: 95, price: 249 },
  ];

  for (const [index, item] of catalog.entries()) {
    const product = await tx.product.create({ data: { name: item.name, category: item.category } });
    for (const size of item.sizes) {
      const sku = ['DEMO', index + 1, item.color, size].filter(Boolean).join('-').toUpperCase();
      const opening = 8 + Math.floor(Math.random() * 20);
      const variant = await tx.productVariant.create({
        data: {
          productId: product.id,
          sku,
          size,
          color: item.color,
          costPrice: item.cost,
          sellingPrice: item.price,
          lowStockThreshold: 5,
        },
      });
      await tx.stockLevel.create({
        data: { variantId: variant.id, warehouseId: warehouse.id, quantity: opening },
      });
      await tx.stockMovement.create({
        data: {
          variantId: variant.id,
          warehouseId: warehouse.id,
          type: 'OPENING',
          quantity: opening,
          balanceAfter: opening,
          unitCost: item.cost,
          note: 'Demo opening stock',
        },
      });
    }
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
