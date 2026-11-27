import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { isGuestOnlyPath, isPublicPath } from "@/lib/authPaths";

/**
 * Refreshes the Supabase session cookie and keeps signed-out visitors off protected pages.
 * `/api` is excluded: route handlers authenticate themselves and answer 401 JSON, not a redirect.
 */
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    }
  );

  // getClaims validates the token (not just reads the cookie), so a forged cookie is not "signed in".
  let signedIn = false;
  let authUnavailable = false;
  try {
    const { data, error } = await supabase.auth.getClaims();
    signedIn = Boolean(data?.claims);
    // A network failure says nothing about the session; do not bounce users to /login for it.
    authUnavailable = Boolean(error && error.name === "AuthRetryableFetchError");
  } catch {
    authUnavailable = true;
  }

  const { pathname, search } = request.nextUrl;

  if (!signedIn && !authUnavailable && !isPublicPath(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = pathname === "/" ? "" : `?next=${encodeURIComponent(pathname + search)}`;
    return NextResponse.redirect(url);
  }

  if (signedIn && isGuestOnlyPath(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
