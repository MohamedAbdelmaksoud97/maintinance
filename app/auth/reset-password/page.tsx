import Link from "next/link";
import { resetPasswordAction } from "@/app/auth/actions";
import { AuthShell } from "@/app/ui/shell";
import { SubmitButton } from "@/app/ui/submit-button";

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ message?: string }>;
}) {
  const message = (await searchParams).message;

  return (
    <AuthShell
      title="استرجاع كلمة المرور"
      description="اكتب بريدك المسجل وسيتم إرسال رابط آمن لاسترجاع كلمة المرور."
      message={message}
    >
      <form action={resetPasswordAction} className="mt-6 space-y-4">
        <label className="block text-sm font-extrabold text-[#324155]">
          البريد الإلكتروني
          <input
            name="email"
            type="email"
            required
            className="mt-2 w-full rounded-lg border border-[#cbd7e3] bg-[#fbfcfd] px-3.5 py-3 font-semibold outline-none transition focus:border-[#0b559f] focus:bg-white focus:ring-4 focus:ring-[#0b559f]/10"
          />
        </label>
        <SubmitButton className="w-full" pendingText="جاري الإرسال">
          إرسال رابط الاسترجاع
        </SubmitButton>
      </form>
      <Link href="/auth/login" className="mt-5 block text-sm font-extrabold text-[#0b559f]">
        العودة لتسجيل الدخول
      </Link>
    </AuthShell>
  );
}
