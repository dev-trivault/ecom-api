/**
 * Creates the first business + owner login, and (in development) some demo products.
 * Safe to run more than once: it does nothing if the owner email already exists.
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
import { setupNewOrganization } from '../src/modules/organization/organization-setup.js';

const isProduction = process.env.NODE_ENV === 'production';
const email = (process.env.SEED_OWNER_EMAIL ?? (isProduction ? '' : 'owner@ecom.local')).trim().toLowerCase();
const password = process.env.SEED_OWNER_PASSWORD ?? (isProduction ? '' : 'Owner@12345');
const ownerName = process.env.SEED_OWNER_NAME ?? 'Owner';
const businessName = process.env.SEED_BUSINESS_NAME ?? 'My Business';
const withDemo = (process.env.SEED_DEMO ?? (isProduction ? 'false' : 'true')) === 'true';

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });

async function main() {
  if (!email || password.length < 8) {
    throw new Error('Set SEED_OWNER_EMAIL and SEED_OWNER_PASSWORD (min 8 characters) to seed production.');
  }
  if (await prisma.user.findUnique({ where: { email } })) {
    console.log(`Owner ${email} already exists, nothing to do.`);
    return;
  }

  await prisma.$transaction(async (tx) => {
    const org = await tx.organization.create({
      data: {
        name: businessName,
        slug: `${businessName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${Date.now().toString(36)}`,
      },
    });
    await tx.user.create({
      data: {
        email,
        name: ownerName,
        passwordHash: await bcrypt.hash(password, 12),
        memberships: { create: { organizationId: org.id, role: 'OWNER' } },
      },
    });
    await setupNewOrganization(tx, org.id);
    if (withDemo) await seedDemoCatalog(tx, org.id);
  });

  console.log(`Created business "${businessName}" with owner ${email}${withDemo ? ' and demo products' : ''}.`);
  if (!isProduction) console.log(`Log in with ${email} / ${password}`);
}

type Tx = Parameters<Parameters<PrismaClient['$transaction']>[0]>[0];

async function seedDemoCatalog(tx: Tx, organizationId: string) {
  const warehouse = await tx.warehouse.findFirstOrThrow({ where: { organizationId, isDefault: true } });
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
    const product = await tx.product.create({ data: { organizationId, name: item.name, category: item.category } });
    for (const size of item.sizes) {
      const sku = ['DEMO', index + 1, item.color, size].filter(Boolean).join('-').toUpperCase();
      const opening = 8 + Math.floor(Math.random() * 20);
      const variant = await tx.productVariant.create({
        data: {
          organizationId,
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
        data: { organizationId, variantId: variant.id, warehouseId: warehouse.id, quantity: opening },
      });
      await tx.stockMovement.create({
        data: {
          organizationId,
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
