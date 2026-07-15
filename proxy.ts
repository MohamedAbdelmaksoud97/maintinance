import { createClient } from "@/utils/supabase/middleware";
import { type NextRequest, NextResponse } from "next/server";

const publicRoutes = [
  "/auth/login",
  "/auth/register",
  "/auth/reset-password",
  "/auth/callback",
  "/auth/confirm",
  "/auth/pending",
];

function withSessionCookies(response: NextResponse, sessionResponse: NextResponse) {
  sessionResponse.cookies.getAll().forEach((cookie) => {
    response.cookies.set(cookie);
  });

  return response;
}

function redirectWithSession(
  request: NextRequest,
  sessionResponse: NextResponse,
  path: string,
) {
  return withSessionCookies(
    NextResponse.redirect(new URL(path, request.url)),
    sessionResponse,
  );
}

export async function proxy(request: NextRequest) {
  const { supabase, supabaseResponse } = createClient(request);
  const pathname = request.nextUrl.pathname;
  const isPublicRoute = publicRoutes.some((route) => pathname.startsWith(route));

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    if (isPublicRoute) {
      return supabaseResponse;
    }

    const next = encodeURIComponent(`${pathname}${request.nextUrl.search}`);
    return redirectWithSession(request, supabaseResponse, `/auth/login?next=${next}`);
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role,approval_status,is_active")
    .eq("id", user.id)
    .maybeSingle();

  const isApproved = profile?.approval_status === "approved" && profile?.is_active;
  const isAdmin = profile?.role === "admin" && isApproved;
  const isWorker = profile?.role === "worker" && isApproved;

  if (pathname.startsWith("/auth/callback") || pathname.startsWith("/auth/confirm")) {
    return supabaseResponse;
  }

  if (isPublicRoute) {
    return redirectWithSession(
      request,
      supabaseResponse,
      isAdmin ? "/" : isWorker ? "/worker/tasks" : "/auth/pending",
    );
  }

  if (!isApproved) {
    return redirectWithSession(request, supabaseResponse, "/auth/pending");
  }

  if (pathname === "/" && !isAdmin) {
    return redirectWithSession(request, supabaseResponse, "/worker/tasks");
  }

  if (pathname.startsWith("/admin") && !isAdmin) {
    return redirectWithSession(request, supabaseResponse, "/worker/tasks");
  }

  if (pathname.startsWith("/worker") && isAdmin) {
    return redirectWithSession(request, supabaseResponse, "/");
  }

  if (pathname.startsWith("/worker") && !isWorker && !isAdmin) {
    return redirectWithSession(request, supabaseResponse, "/auth/pending");
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
