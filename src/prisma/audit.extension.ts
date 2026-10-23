import { Prisma } from '../generated/prisma/client.js';
import { currentActorId } from '../common/auth/request-actor.js';

type Data = Record<string, unknown>;

/**
 * Stamps `createdById` / `updatedById` with the signed-in user on every write, nested creates included,
 * so no service has to remember to. Every table has both columns (see CLAUDE.md, "Audit columns").
 * A value the caller sets itself is kept. Outside a request (seed, scripts, public routes) nothing is stamped.
 */
export const auditExtension = Prisma.defineExtension({
  name: 'audit-columns',
  query: {
    $allModels: {
      $allOperations({ operation, args, query }) {
        const actorId = currentActorId();
        if (actorId) stampArgs(operation, args as Data, actorId);
        return query(args);
      },
    },
  },
});

function stampArgs(operation: string, args: Data, actorId: string) {
  switch (operation) {
    case 'create':
      stampCreate(args.data, actorId);
      break;
    case 'createMany':
    case 'createManyAndReturn':
      forEachRecord(args.data, (record) => stampCreate(record, actorId));
      break;
    case 'update':
    case 'updateMany':
    case 'updateManyAndReturn':
      forEachRecord(args.data, (record) => stampUpdate(record, actorId));
      break;
    case 'upsert':
      stampCreate(args.create, actorId);
      stampUpdate(args.update, actorId);
      break;
  }
}

function stampCreate(data: unknown, actorId: string) {
  if (!isRecord(data)) return;
  // A relation-style `createdBy: { connect }` already names the creator.
  if (!('createdById' in data) && !('createdBy' in data)) data.createdById = actorId;
  if (!('updatedById' in data)) data.updatedById = actorId;
  stampNested(data, actorId);
}

function stampUpdate(data: unknown, actorId: string) {
  if (!isRecord(data)) return;
  if (!('updatedById' in data)) data.updatedById = actorId;
  stampNested(data, actorId);
}

/** Child rows written through a relation field (`items: { createMany: { data } }`, `{ create }`, …). */
function stampNested(data: Data, actorId: string) {
  for (const value of Object.values(data)) {
    if (!isRecord(value)) continue;
    if ('create' in value) forEachRecord(value.create, (r) => stampCreate(r, actorId));
    if (isRecord(value.createMany)) forEachRecord(value.createMany.data, (r) => stampCreate(r, actorId));
    if ('update' in value) forEachRecord(value.update, (r) => stampUpdate(isRecord(r) && 'data' in r ? r.data : r, actorId));
    if ('updateMany' in value) forEachRecord(value.updateMany, (r) => stampUpdate(isRecord(r) ? r.data : r, actorId));
    if ('upsert' in value)
      forEachRecord(value.upsert, (r) => {
        if (!isRecord(r)) return;
        stampCreate(r.create, actorId);
        stampUpdate(r.update, actorId);
      });
  }
}

function forEachRecord(value: unknown, fn: (record: unknown) => void) {
  if (Array.isArray(value)) value.forEach(fn);
  else fn(value);
}

function isRecord(value: unknown): value is Data {
  return typeof value === 'object' && value !== null && !Array.isArray(value) && !(value instanceof Date);
}
