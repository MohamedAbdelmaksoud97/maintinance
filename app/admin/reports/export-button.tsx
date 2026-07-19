"use client";

import { AlertTriangle, CheckCircle2, Download, Loader2 } from "lucide-react";
import { useState } from "react";

type ExportState = "idle" | "loading" | "success" | "error";

export function ExportExcelButton({ href, filename }: { href: string; filename: string }) {
  const [state, setState] = useState<ExportState>("idle");
  const [message, setMessage] = useState("");

  async function handleExport() {
    if (state === "loading") return;
    const progressTimers: number[] = [];
    setState("loading");
    setMessage("جاري حساب الخطة السنوية وتجهيز ملف Excel...");
    progressTimers.push(
      window.setTimeout(() => {
        setMessage("يتم الآن تنسيق ملف Excel الرسمي. قد يستغرق ذلك عدة ثواني حسب حجم السنة.");
      }, 6000),
      window.setTimeout(() => {
        setMessage("ما زال التصدير يعمل. لا تغلق الصفحة حتى يبدأ التحميل.");
      }, 18000),
    );

    try {
      const response = await fetch(href, { cache: "no-store" });
      if (!response.ok) throw new Error("تعذر إنشاء ملف Excel");
      const contentType = response.headers.get("content-type") ?? "";
      if (!contentType.includes("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")) {
        throw new Error("لم يستلم النظام ملف Excel صالح");
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = filenameFromHeader(response.headers.get("content-disposition")) ?? filename;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      setState("success");
      setMessage("تم تجهيز الملف وبدء التحميل.");
      window.setTimeout(() => {
        setState("idle");
        setMessage("");
      }, 3200);
    } catch {
      setState("error");
      setMessage("تعذر تصدير الملف الآن. تأكد من تسجيل الدخول ثم أعد المحاولة.");
    } finally {
      progressTimers.forEach((timer) => window.clearTimeout(timer));
    }
  }

  const isLoading = state === "loading";

  return (
    <div className="relative">
      <button
        type="button"
        onClick={handleExport}
        disabled={isLoading}
        aria-busy={isLoading}
        className="inline-flex items-center gap-2 rounded-lg bg-[#0b559f] px-3.5 py-2 text-sm font-extrabold text-white shadow-sm transition duration-200 hover:-translate-y-0.5 hover:bg-[#0a3f78] hover:shadow-md active:translate-y-0 disabled:pointer-events-none disabled:translate-y-0 disabled:cursor-wait disabled:opacity-80"
      >
        {isLoading ? <Loader2 size={17} className="animate-spin" /> : <Download size={17} />}
        {isLoading ? "جاري التصدير" : "تصدير Excel"}
      </button>

      {state !== "idle" ? (
        <div className="absolute left-0 top-full z-30 mt-2 w-[min(360px,88vw)] rounded-lg border border-[#dbe3ea] bg-white p-3 text-right shadow-xl">
          <div className="flex items-start gap-3">
            <div
              className={
                state === "success"
                  ? "grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-[#eef9f2] text-[#207a45]"
                  : state === "error"
                    ? "grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-[#fff0f1] text-[#c1121f]"
                    : "grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-[#eef6ff] text-[#0b559f]"
              }
            >
              {state === "success" ? <CheckCircle2 size={19} /> : state === "error" ? <AlertTriangle size={19} /> : <Loader2 size={19} className="animate-spin" />}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-black text-[#172033]">
                {state === "success" ? "اكتمل التصدير" : state === "error" ? "فشل التصدير" : "يتم تجهيز التقرير"}
              </p>
              <p className="mt-1 text-xs font-semibold leading-5 text-[#607086]">{message}</p>
              {state === "loading" ? (
                <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-[#e8eef4]">
                  <div className="h-full w-1/2 animate-[pulse_1.2s_ease-in-out_infinite] rounded-full bg-[#0b559f]" />
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function filenameFromHeader(header: string | null) {
  if (!header) return null;
  const match = header.match(/filename="([^"]+)"/i);
  return match?.[1] ?? null;
}
