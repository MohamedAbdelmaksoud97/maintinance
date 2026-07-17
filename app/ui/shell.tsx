import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import { AppSidebar } from "@/app/ui/sidebar";

type Tone = "neutral" | "success" | "warning" | "danger";

export function LogoMark({ size = 64 }: { size?: number }) {
  return (
    <div
      className="grid shrink-0 place-items-center rounded-lg border border-[#dbe3ea] bg-white shadow-sm"
      style={{ width: size, height: size }}
    >
      <Image
        src="/spcc-logo.jpeg"
        alt="شعار شركة أسمنت المنطقة الجنوبية"
        width={size - 10}
        height={size - 10}
        priority
        className="object-contain"
      />
    </div>
  );
}

export function BrandLockup({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <LogoMark size={compact ? 50 : 70} />
      <div className="min-w-0">
        <p className="truncate text-xs font-extrabold text-[#0b559f] sm:text-sm">
          شركة أسمنت المنطقة الجنوبية
        </p>
        <h1 className={compact ? "truncate text-lg font-black" : "text-2xl font-black sm:text-3xl"}>
          نظام صيانة الزيت والشحم
        </h1>
      </div>
    </div>
  );
}

export function AuthShell({
  title,
  description,
  message,
  children,
}: {
  title: string;
  description: string;
  message?: string;
  children: ReactNode;
}) {
  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,rgba(11,85,159,0.10),transparent_34%),linear-gradient(180deg,#ffffff_0%,#f4f6f8_62%)] px-5 py-8 text-[#172033]">
      <div className="mx-auto grid min-h-[calc(100vh-64px)] max-w-6xl items-center gap-8 lg:grid-cols-[0.95fr_1.05fr]">
        <section className="hidden lg:block">
          <BrandLockup />
          <div className="mt-8 max-w-xl rounded-lg border border-[#dbe3ea] bg-white/85 p-6 shadow-sm backdrop-blur">
            <p className="text-sm font-bold text-[#0b559f]">منصة صيانة يومية</p>
            <h2 className="mt-2 text-3xl font-black leading-tight">
              خطة الصيانة، العمال، التقارير والمخزون في نظام واحد.
            </h2>
            <div className="mt-6 grid gap-3 text-sm text-[#516173]">
              <FeatureLine text="تنظيم مهام الصيانة اليومية حسب التاريخ." />
              <FeatureLine text="تعيين عامل مسؤول لكل مهمة قبل إرسالها." />
              <FeatureLine text="متابعة الزيت والمعدات والمهام العارضة من لوحة واحدة." />
            </div>
          </div>
        </section>

        <section className="mx-auto w-full max-w-md rounded-lg border border-[#dbe3ea] bg-white p-6 shadow-[0_18px_45px_rgba(20,32,51,0.10)]">
          <div className="mb-6 lg:hidden">
            <BrandLockup compact />
          </div>
          <div className="hidden justify-center lg:flex">
            <LogoMark size={82} />
          </div>
          <div className="mt-4 text-center">
            <h1 className="text-2xl font-black">{title}</h1>
            <p className="mt-2 text-sm leading-6 text-[#607086]">{description}</p>
          </div>
          {message ? (
            <p className="mt-5 rounded-lg border border-[#bdd6ee] bg-[#eef6ff] p-3 text-sm font-semibold text-[#0b559f]">
              {message}
            </p>
          ) : null}
          {children}
        </section>
      </div>
    </main>
  );
}

export function AppShell({
  children,
  actions,
  navigationScope = "admin",
}: {
  children: ReactNode;
  actions?: ReactNode;
  navigationScope?: "admin" | "worker";
}) {
  return (
    <main className="min-h-screen bg-[#f4f6f8] text-[#172033] lg:pr-[280px]">
      <AppSidebar scope={navigationScope} />
      <header className="sticky top-0 z-20 border-b border-[#dbe3ea] bg-white/95 shadow-sm backdrop-blur lg:hidden">
        <div className="px-5 py-4 pr-20">
          <BrandLockup compact />
        </div>
      </header>
      <div className="mx-auto max-w-7xl px-5 py-5 sm:px-8 lg:py-8">
        {actions ? <div className="mb-5 flex flex-wrap justify-end gap-2">{actions}</div> : null}
        {children}
      </div>
    </main>
  );
}

export function PageHeader({
  title,
  description,
  eyebrow,
  action,
}: {
  title: string;
  description?: string;
  eyebrow?: string;
  action?: ReactNode;
}) {
  return (
    <section className="mb-5 rounded-lg border border-[#dbe3ea] bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          {eyebrow ? <p className="text-xs font-black text-[#0b559f]">{eyebrow}</p> : null}
          <h2 className="mt-1 text-2xl font-black">{title}</h2>
          {description ? <p className="mt-2 max-w-3xl text-sm leading-6 text-[#607086]">{description}</p> : null}
        </div>
        {action}
      </div>
    </section>
  );
}

export function NavButton({
  href,
  children,
  variant = "primary",
}: {
  href: string;
  children: ReactNode;
  variant?: "primary" | "secondary";
}) {
  return (
    <Link
      href={href}
      className={
        variant === "primary"
          ? "rounded-lg bg-[#0b559f] px-3.5 py-2 text-sm font-extrabold text-white shadow-sm transition duration-200 hover:-translate-y-0.5 hover:bg-[#0a3f78] hover:shadow-md active:translate-y-0"
          : "rounded-lg border border-[#cbd7e3] bg-white px-3.5 py-2 text-sm font-extrabold text-[#324155] shadow-sm transition duration-200 hover:-translate-y-0.5 hover:border-[#0b559f] hover:text-[#0b559f] hover:shadow-md active:translate-y-0"
      }
    >
      {children}
    </Link>
  );
}

export function MetricCard({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string | number;
  tone?: Tone;
}) {
  const colors: Record<Tone, string> = {
    neutral: "text-[#0b559f] bg-[#f2f7fc]",
    success: "text-[#207a45] bg-[#eef9f2]",
    warning: "text-[#a16207] bg-[#fff7e8]",
    danger: "text-[#c1121f] bg-[#fff0f1]",
  };

  const formatted = typeof value === "number" ? value.toLocaleString("en-US") : value;

  return (
    <div className="rounded-lg border border-[#dbe3ea] bg-white p-4 shadow-sm">
      <div className={`inline-flex rounded-md px-2.5 py-1 text-2xl font-black ${colors[tone]}`}>
        {formatted}
      </div>
      <p className="mt-3 text-sm font-bold text-[#607086]">{label}</p>
    </div>
  );
}

export function ContentCard({ children }: { children: ReactNode }) {
  return <section className="rounded-lg border border-[#dbe3ea] bg-white p-5 shadow-sm">{children}</section>;
}

export function StatusBadge({ children, tone = "neutral" }: { children: ReactNode; tone?: Tone }) {
  const colors: Record<Tone, string> = {
    neutral: "bg-[#eef6ff] text-[#0b559f]",
    success: "bg-[#eef9f2] text-[#207a45]",
    warning: "bg-[#fff7e8] text-[#a16207]",
    danger: "bg-[#fff0f1] text-[#c1121f]",
  };

  return <span className={`rounded-md px-2.5 py-1 text-xs font-black ${colors[tone]}`}>{children}</span>;
}

export function FeatureLine({ text }: { text: string }) {
  return (
    <div className="flex items-start gap-2">
      <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[#c1121f]" />
      <span>{text}</span>
    </div>
  );
}
