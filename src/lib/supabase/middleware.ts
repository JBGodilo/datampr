import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

type CookieToSet = { name: string; value: string; options: CookieOptions };

const PUBLIC_PATH_PREFIXES = ["/auth", "/_next", "/favicon"];

function isPublicPath(pathname: string): boolean {
  if (pathname === "/") return true;
  return PUBLIC_PATH_PREFIXES.some((p) => pathname.startsWith(p));
}

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: CookieToSet[]) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  // IMPORTANT: this call refreshes the session cookie if needed. When the
  // browser has a stale cookie whose refresh token no longer exists on the
  // auth server (e.g. after a Site URL change, project rotation, or manual
  // signout from another device), @supabase/ssr throws AuthApiError instead
  // of returning `{ user: null }`. Catching it here keeps the middleware
  // from 500ing every request — we just proceed as if the user is signed
  // out, and the next render of /auth/login lets them re-auth cleanly.
  let user: { id: string } | null = null;
  try {
    const { data } = await supabase.auth.getUser();
    user = data.user;
  } catch {
    // Wipe the bad cookies so subsequent requests don't keep hitting the
    // same throw. `scope: "local"` skips the auth-server roundtrip (which
    // would also throw "refresh_token_not_found") and just clears the local
    // session cookies via the setAll callback above.
    try {
      await supabase.auth.signOut({ scope: "local" });
    } catch {
      // ignore — cookies may not have cleared, but worst case the user
      // hits the catch again next request.
    }
  }

  const pathname = request.nextUrl.pathname;
  const isPublic = isPublicPath(pathname);

  if (!user && !isPublic) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/auth/login";
    redirectUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(redirectUrl);
  }

  if (user && (pathname === "/" || pathname === "/auth/login")) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/import";
    redirectUrl.search = "";
    return NextResponse.redirect(redirectUrl);
  }

  return response;
}
