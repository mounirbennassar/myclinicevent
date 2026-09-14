import { NextResponse, type NextRequest } from "next/server";

// Fast redirect for signed-out visitors. The API still checks every request; this only saves a round trip.
export function proxy(request: NextRequest) {
  if (!request.cookies.has("mce_session")) {
    const login = new URL("/login", request.url);
    login.searchParams.set("next", request.nextUrl.pathname + request.nextUrl.search);
    return NextResponse.redirect(login);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*", "/sponsor/:path*"],
};
