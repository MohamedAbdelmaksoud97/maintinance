"use client";

import { CheckCircle2, Loader2, XCircle } from "lucide-react";
import { useFormStatus } from "react-dom";

export function ApprovalButtons({ approved }: { approved: boolean }) {
  const { pending, data } = useFormStatus();
  const submittedValue = data?.get("approve");
  const approving = pending && submittedValue === "true";
  const rejecting = pending && submittedValue === "false";

  return (
    <div className="flex flex-wrap gap-2">
      <button
        type="submit"
        name="approve"
        value="true"
        disabled={pending}
        aria-busy={approving}
        className="inline-flex min-w-[132px] items-center justify-center gap-2 rounded-lg bg-[#207a45] px-3 py-2.5 text-xs font-black text-white shadow-sm transition duration-200 hover:-translate-y-0.5 hover:bg-[#176333] hover:shadow-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#207a45] active:translate-y-0 disabled:pointer-events-none disabled:cursor-wait disabled:opacity-75"
      >
        {approving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <CheckCircle2 className="h-4 w-4" aria-hidden="true" />}
        <span>{approving ? "جاري الحفظ" : approved ? "حفظ المناطق" : "اعتماد وحفظ"}</span>
      </button>
      <button
        type="submit"
        name="approve"
        value="false"
        disabled={pending}
        aria-busy={rejecting}
        className="inline-flex min-w-[92px] items-center justify-center gap-2 rounded-lg border border-[#e7a2a8] bg-white px-3 py-2.5 text-xs font-black text-[#c1121f] shadow-sm transition duration-200 hover:-translate-y-0.5 hover:border-[#c1121f] hover:bg-[#fff1f2] hover:shadow-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#c1121f] active:translate-y-0 disabled:pointer-events-none disabled:cursor-wait disabled:opacity-75"
      >
        {rejecting ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <XCircle className="h-4 w-4" aria-hidden="true" />}
        <span>{rejecting ? "جاري الحفظ" : "رفض"}</span>
      </button>
    </div>
  );
}
