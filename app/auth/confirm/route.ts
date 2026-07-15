import { createClient } from "@/utils/supabase/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

const allowedTypes = new Set(["signup", "invite", "magiclink", "recovery", "email_change", "email"]);

function redirectTo(requestUrl: URL, path: string) {
  return NextResponse.redirect(new URL(path, requestUrl.origin));
}

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const tokenHash = requestUrl.searchParams.get("token_hash");
  const type = requestUrl.searchParams.get("type");
  const next = requestUrl.searchParams.get("next") ?? requestUrl.searchParams.get("redirect_to") ?? "/";

  if (!tokenHash || !type || !allowedTypes.has(type)) {
    const message = encodeURIComponent("رابط التفعيل غير مكتمل أو غير صالح.");
    return redirectTo(requestUrl, `/auth/login?message=${message}`);
  }

  const supabase = createClient(await cookies());
  const { error } = await supabase.auth.verifyOtp({
    token_hash: tokenHash,
    type: type as EmailOtpType,
  });

  if (error) {
    const message = encodeURIComponent(error.message);
    return redirectTo(requestUrl, `/auth/login?message=${message}`);
  }

  return redirectTo(requestUrl, next);
}

