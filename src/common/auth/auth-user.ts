/** The authenticated caller, decoded from the access token and attached to the request. */
export interface AuthUser {
  userId: string;
  sessionId: string;
}

/** JWT claims. Kept short because the token travels with every request. */
export interface AccessTokenPayload {
  sub: string;
  sid: string;
}
