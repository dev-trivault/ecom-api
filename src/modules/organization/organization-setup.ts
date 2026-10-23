import type { Tx } from '../../prisma/prisma.service.js';

export const DEFAULT_CHANNELS = [
  { code: 'MEESHO', name: 'Meesho', color: '#9B1FE8' },
  { code: 'FLIPKART', name: 'Flipkart', color: '#2874F0' },
  { code: 'AMAZON', name: 'Amazon', color: '#FF9900' },
  { code: 'MYNTRA', name: 'Myntra', color: '#FF3F6C' },
] as const;

/**
 * Everything a brand-new business needs before its first entry: a default warehouse and
 * the marketplaces it sells on. Used by registration and by the seed script.
 */
export async function setupNewOrganization(tx: Tx, organizationId: string) {
  await tx.warehouse.create({
    data: { organizationId, name: 'Main Warehouse', isDefault: true },
  });
  await tx.salesChannel.createMany({
    data: DEFAULT_CHANNELS.map((c, i) => ({ organizationId, ...c, sortOrder: i })),
  });
}
