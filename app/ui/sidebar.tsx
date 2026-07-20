"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  Boxes,
  CalendarDays,
  ClipboardList,
  FileSpreadsheet,
  Gauge,
  ListChecks,
  Menu,
  Bell,
  PackagePlus,
  UserCheck,
  Wrench,
  X,
} from "lucide-react";

type NavigationScope = "admin" | "worker";

const adminNavItems = [
  { href: "/", label: "لوحة الإحصائيات", icon: Gauge },
  { href: "/admin/planned-tasks", label: "خطة الصيانة", icon: CalendarDays },
  { href: "/admin/reports", label: "التقارير", icon: FileSpreadsheet },
  { href: "/admin/notifications", label: "إشعارات المدير", icon: Bell },
  { href: "/admin/data-completion", label: "بيانات تحتاج استكمال", icon: ListChecks },
  { href: "/admin/oils", label: "الزيوت", icon: PackagePlus },
  { href: "/admin/equipment", label: "المعدات", icon: Boxes },
  { href: "/admin/ad-hoc-tasks", label: "مهمة عارضة", icon: Wrench },
  { href: "/admin/workers", label: "العمال", icon: UserCheck },
];

const workerNavItems = [
  { href: "/worker/tasks", label: "مهامي", icon: ClipboardList },
  { href: "/worker/notifications", label: "الإشعارات", icon: Bell },
];

export function MobileMenuButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      aria-label="فتح القائمة"
      onClick={onClick}
      className="grid h-11 w-11 place-items-center rounded-lg border border-[#dbe3ea] bg-white text-[#0b559f] shadow-sm transition duration-200 hover:-translate-y-0.5 hover:border-[#0b559f] hover:shadow-md active:translate-y-0 lg:hidden"
    >
      <Menu size={23} />
    </button>
  );
}

function SidebarContent({ onNavigate, scope }: { onNavigate?: () => void; scope: NavigationScope }) {
  const pathname = usePathname();
  const navItems = scope === "worker" ? workerNavItems : adminNavItems;

  return (
    <div className="flex h-full flex-col bg-white">
      <div className="border-b border-[#e2e8ef] p-5">
        <div className="flex items-center gap-3">
          <div className="grid h-14 w-14 shrink-0 place-items-center rounded-lg border border-[#dbe3ea] bg-white shadow-sm">
            <Image
              src="/spcc-logo.jpeg"
              alt="شعار شركة أسمنت المنطقة الجنوبية"
              width={48}
              height={48}
              priority
              className="object-contain"
            />
          </div>
          <div className="min-w-0">
            <p className="truncate text-xs font-bold text-[#0b559f]">شركة أسمنت المنطقة الجنوبية</p>
            <p className="truncate text-lg font-black text-[#172033]">نظام الصيانة</p>
          </div>
        </div>
      </div>

      <nav className="flex-1 space-y-1 p-3">
        {navItems.map((item) => {
          const Icon = item.icon;
          const active = pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href));

          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNavigate}
              className={
                active
                  ? "flex items-center gap-3 rounded-lg bg-[#eef6ff] px-3 py-3 text-sm font-black text-[#0b559f] shadow-sm transition duration-200"
                  : "flex items-center gap-3 rounded-lg px-3 py-3 text-sm font-extrabold text-[#516173] transition duration-200 hover:-translate-y-0.5 hover:bg-[#f4f7fa] hover:text-[#0b559f] hover:shadow-sm active:translate-y-0"
              }
            >
              <Icon size={19} strokeWidth={2.4} />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-[#e2e8ef] p-4 text-xs leading-6 text-[#607086]">
        متابعة مهام الصيانة والتنفيذ اليومي من مكان واحد.
      </div>
    </div>
  );
}

export function AppSidebar({ scope = "admin" }: { scope?: NavigationScope }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <aside className="fixed inset-y-0 right-0 z-40 hidden w-[280px] border-l border-[#dbe3ea] bg-white shadow-sm lg:block">
        <SidebarContent scope={scope} />
      </aside>

      {open ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            aria-label="إغلاق القائمة"
            className="absolute inset-0 bg-[#172033]/45"
            onClick={() => setOpen(false)}
          />
          <aside className="absolute inset-y-0 right-0 w-[84vw] max-w-[340px] bg-white shadow-2xl">
            <button
              type="button"
              aria-label="إغلاق القائمة"
              onClick={() => setOpen(false)}
              className="absolute left-3 top-3 grid h-9 w-9 place-items-center rounded-lg bg-[#f4f7fa] text-[#172033] transition duration-200 hover:-translate-y-0.5 hover:bg-[#e8eef4] hover:shadow-md active:translate-y-0"
            >
              <X size={20} />
            </button>
            <SidebarContent scope={scope} onNavigate={() => setOpen(false)} />
          </aside>
        </div>
      ) : null}

      <MobileMenuContextButton onOpen={() => setOpen(true)} />
    </>
  );
}

function MobileMenuContextButton({ onOpen }: { onOpen: () => void }) {
  return (
    <div className="fixed right-5 top-4 z-30 lg:hidden">
      <MobileMenuButton onClick={onOpen} />
    </div>
  );
}
