import { signOutAction } from "@/app/auth/actions";
import { AuthShell } from "@/app/ui/shell";

export default function PendingPage() {
  return (
    <AuthShell
      title="الحساب بانتظار الاعتماد"
      description="تم تسجيل الحساب بنجاح، لكن لا يمكن استخدام النظام قبل اعتماد المدير. بعد الاعتماد ستظهر المهام اليومية حسب الصلاحية."
    >
      <form action={signOutAction} className="mt-6">
        <button className="w-full rounded-lg bg-[#0b559f] px-4 py-3 text-sm font-black text-white shadow-sm transition hover:bg-[#0a3f78]">
          تسجيل الخروج
        </button>
      </form>
    </AuthShell>
  );
}
