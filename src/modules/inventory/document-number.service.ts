import { Injectable } from '@nestjs/common';
import type { Tx } from '../../prisma/prisma.service.js';

const PREFIXES = {
  PURCHASE: 'PUR',
  DISPATCH: 'PCK',
  RETURN: 'RET',
} as const;

export type DocumentKind = keyof typeof PREFIXES;

/** Gap-free, per-organization document numbers: PUR-00001, PCK-00001, RET-00001. */
@Injectable()
export class DocumentNumberService {
  /** Must run inside the transaction that creates the document, so a rollback frees the number. */
  async next(tx: Tx, organizationId: string, kind: DocumentKind): Promise<string> {
    const seq = await tx.documentSequence.upsert({
      where: { organizationId_key: { organizationId, key: kind } },
      create: { organizationId, key: kind, lastValue: 1 },
      update: { lastValue: { increment: 1 } },
    });
    return `${PREFIXES[kind]}-${String(seq.lastValue).padStart(5, '0')}`;
  }
}
