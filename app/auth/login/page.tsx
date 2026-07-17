import Link from "next/link";
import { signInAction } from "@/app/auth/actions";
import { AuthShell } from "@/app/ui/shell";
import { SubmitButton } from "@/app/ui/submit-button";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ message?: string }>;
}) {
  const message = (await searchParams).message;

  return (
    <AuthShell
      title="تسجيل الدخول"
      description="ادخل إلى لوحة المتابعة حسب صلاحيتك. المدير يرى الإدارة الكاملة، والعامل يرى المهام المسندة له فقط."
      message={message}
    >
      <form action={signInAction} className="mt-6 space-y-4">
        <Field label="البريد الإلكتروني" name="email" type="email" />
        <Field label="كلمة المرور" name="password" type="password" />
        <SubmitButton className="w-full" pendingText="جاري الدخول">
          دخول النظام
        </SubmitButton>
      </form>
      <div className="mt-5 flex items-center justify-between gap-3 text-sm">
        <Link href="/auth/register" className="font-extrabold text-[#0b559f]">
          إنشاء حساب عامل
        </Link>
        <Link href="/auth/reset-password" className="font-extrabold text-[#0b559f]">
          نسيت كلمة المرور؟
        </Link>
      </div>
    </AuthShell>
  );
}

function Field({ label, name, type }: { label: string; name: string; type: string }) {
  return (
    <label className="block text-sm font-extrabold text-[#324155]">
      {label}
      <input
        name={name}
        type={type}
        required
        className="mt-2 w-full rounded-lg border border-[#cbd7e3] bg-[#fbfcfd] px-3.5 py-3 font-semibold outline-none transition focus:border-[#0b559f] focus:bg-white focus:ring-4 focus:ring-[#0b559f]/10"
      />
    </label>
  );
}
