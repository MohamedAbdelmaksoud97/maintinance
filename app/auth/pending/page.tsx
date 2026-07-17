import { signOutAction } from "@/app/auth/actions";
import { AuthShell } from "@/app/ui/shell";
import { SubmitButton } from "@/app/ui/submit-button";

export default function PendingPage() {
  return (
    <AuthShell
      title="الحساب بانتظار الاعتماد"
      description="تم تسجيل الحساب بنجاح، لكن لا يمكن استخدام النظام قبل اعتماد المدير. بعد الاعتماد ستظهر المهام اليومية حسب الصلاحية."
    >
      <form action={signOutAction} className="mt-6">
        <SubmitButton className="w-full" pendingText="جاري الخروج">
          تسجيل الخروج
        </SubmitButton>
      </form>
    </AuthShell>
  );
}
