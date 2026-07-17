import Link from "next/link";
import { signUpAction } from "@/app/auth/actions";
import { AuthShell } from "@/app/ui/shell";
import { SubmitButton } from "@/app/ui/submit-button";

export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ message?: string }>;
}) {
  const message = (await searchParams).message;

  return (
    <AuthShell
      title="إنشاء حساب عامل"
      description="بعد التسجيل وتأكيد البريد الإلكتروني، سيظهر الحساب للمدير لاعتماده قبل استلام المهام."
      message={message}
    >
      <form action={signUpAction} className="mt-6 space-y-4">
        <Field label="اسم العامل" name="full_name" type="text" />
        <Field label="البريد الإلكتروني" name="email" type="email" />
        <Field label="كلمة المرور" name="password" type="password" />
        <SubmitButton className="w-full" pendingText="جاري إنشاء الحساب">
          إنشاء الحساب
        </SubmitButton>
      </form>
      <Link href="/auth/login" className="mt-5 block text-sm font-extrabold text-[#0b559f]">
        لدي حساب بالفعل
      </Link>
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
