
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
