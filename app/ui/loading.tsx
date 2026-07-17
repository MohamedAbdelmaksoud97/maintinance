import { AppShell } from "@/app/ui/shell";

export function SectionLoading({
  cards = 3,
  rows = 6,
  navigationScope = "admin",
}: {
  cards?: number;
  rows?: number;
  navigationScope?: "admin" | "worker";
}) {
  return (
    <AppShell navigationScope={navigationScope}>
      <div className="space-y-5">
        <div className="flex items-center justify-between gap-4 rounded-lg border border-[#dbe3ea] bg-white p-5 shadow-sm">
          <div className="space-y-3">
            <div className="h-4 w-32 animate-pulse rounded-full bg-[#dbe8f6]" />
            <div className="h-8 w-56 animate-pulse rounded-full bg-[#e8eef4]" />
          </div>
          <div className="h-12 w-12 animate-pulse rounded-lg bg-[#eef6ff]" />
        </div>
        <div className="h-28 animate-pulse rounded-lg bg-white shadow-sm" />
        <div className="grid gap-3 sm:grid-cols-3">
          {Array.from({ length: cards }).map((_, index) => (
            <div key={index} className="h-24 animate-pulse rounded-lg bg-white shadow-sm" />
          ))}
        </div>
        <div className="space-y-3 rounded-lg bg-white p-5 shadow-sm">
          {Array.from({ length: rows }).map((_, index) => (
            <div key={index} className="h-16 animate-pulse rounded-lg bg-[#eef2f6]" />
          ))}
        </div>
      </div>
    </AppShell>
  );
}
