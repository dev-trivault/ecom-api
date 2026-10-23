import type { Role } from '../../generated/prisma/enums.js';

/** The authenticated caller, decoded from the access token and attached to the request. */
export interface AuthUser {
  userId: string;
  organizationId: string;
  role: Role;
  sessionId: string;
}

/** JWT claims. Kept short because the token travels with every request. */
export interface AccessTokenPayload {
  sub: string;
  org: string;
  role: Role;
  sid: string;
}
