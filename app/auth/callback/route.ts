import { createClient } from "@/utils/supabase/server";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

function redirectTo(requestUrl: URL, path: string) {
  return NextResponse.redirect(new URL(path, requestUrl.origin));
}

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const error = requestUrl.searchParams.get("error");
  const errorDescription = requestUrl.searchParams.get("error_description");
  const next = requestUrl.searchParams.get("next") ?? "/";

  if (error) {
    const message = encodeURIComponent(errorDescription ?? "رابط التفعيل غير صالح أو انتهت صلاحيته");
    return redirectTo(requestUrl, `/auth/login?message=${message}`);
  }

  if (!code) {
    const message = encodeURIComponent("رابط التفعيل غير مكتمل. افتح آخر رسالة تفعيل وصلت على البريد.");
    return redirectTo(requestUrl, `/auth/login?message=${message}`);
  }

  const supabase = createClient(await cookies());
  const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);

  if (exchangeError) {
    const message = encodeURIComponent(exchangeError.message);
    return redirectTo(requestUrl, `/auth/login?message=${message}`);
  }

  return redirectTo(requestUrl, next);
}

