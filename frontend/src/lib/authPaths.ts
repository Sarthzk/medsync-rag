/** Pages reachable without a session. `/auth/*` holds the email-link callback. */
const PUBLIC_PATHS = ["/login", "/signup", "/forgot-password", "/reset-password"];

/** Pages a signed-in user has no reason to see (they are sent to the app instead). */
const GUEST_ONLY_PATHS = ["/login", "/signup"];

export const isPublicPath = (pathname: string): boolean =>
  PUBLIC_PATHS.includes(pathname) || pathname.startsWith("/auth/");

export const isGuestOnlyPath = (pathname: string): boolean => GUEST_ONLY_PATHS.includes(pathname);

/**
 * Returns `next` only if it is a same-site path, else `fallback`.
 * Guards the post-login redirect against open redirects ("//evil.com", "/\evil.com", "https://...").
 */
export const safeNext = (next: string | null | undefined, fallback = "/"): string => {
  if (!next || !next.startsWith("/") || next.startsWith("//") || /[\\\u0000-\u001f]/.test(next)) {
    return fallback;
  }
  return next;
};
