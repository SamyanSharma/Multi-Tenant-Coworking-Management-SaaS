// Centralizes JWT config so AuthModule and any other module that needs
// to sign/verify (Socket.io gateway) read it from one place.
//
// JWT_SECRET must be set in production. The fallback below exists only
// so local dev doesn't crash on a missing .env var; it is NOT safe to
// deploy with. Flagged in README's env var setup section.
export const JWT_SECRET =
  process.env.JWT_SECRET ?? 'dev-only-insecure-secret-change-me';

export const JWT_EXPIRES_IN = '8h';

if (
  process.env.NODE_ENV === 'production' &&
  !process.env.JWT_SECRET
) {
  throw new Error(
    'JWT_SECRET must be set in production — refusing to boot with the dev fallback secret.',
  );
}
