import Link from "next/link";
import { resendConfirmationAction, signOutAction } from "@/app/auth/actions";
import { AuthShell } from "@/app/ui/shell";
import { SubmitButton } from "@/app/ui/submit-button";
import { createClient } from "@/utils/supabase/server";
import { cookies } from "next/headers";

export default async function VerifyEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string; message?: string }>;
}) {
  const params = await searchParams;
  const supabase = createClient(await cookies());
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const email = user?.email ?? params.email ?? "";

  return (
    <AuthShell
      title="يجب تأكيد البريد الإلكتروني"
      description="افتح رسالة التفعيل المرسلة إلى بريدك الإلكتروني واضغط على رابط التأكيد. بعد تأكيد البريد سيتم تحويل الحساب إلى مرحلة اعتماد المدير."
      message={params.message}
    >
      <form action={resendConfirmationAction} className="mt-6 space-y-4">
        {user?.email ? (
          <p className="rounded-lg border border-[#dbe3ea] bg-[#fbfcfd] px-3.5 py-3 text-sm font-bold text-[#324155]">
            {user.email}
          </p>
        ) : (
          <label className="block text-sm font-extrabold text-[#324155]">
            البريد الإلكتروني
            <input
              name="email"
              type="email"
              defaultValue={email}
              required
              className="mt-2 w-full rounded-lg border border-[#cbd7e3] bg-[#fbfcfd] px-3.5 py-3 font-semibold outline-none transition focus:border-[#0b559f] focus:bg-white focus:ring-4 focus:ring-[#0b559f]/10"
            />
          </label>
        )}
        <SubmitButton className="w-full" pendingText="جاري إرسال الرابط">
          إعادة إرسال رابط التفعيل
        </SubmitButton>
      </form>

      {user ? (
        <form action={signOutAction} className="mt-3">
          <SubmitButton className="w-full" variant="secondary" pendingText="جاري الخروج">
            تسجيل الخروج
          </SubmitButton>
        </form>
      ) : (
        <Link href="/auth/login" className="mt-5 block text-center text-sm font-extrabold text-[#0b559f]">
          الرجوع إلى تسجيل الدخول
        </Link>
      )}
    </AuthShell>
  );
}
