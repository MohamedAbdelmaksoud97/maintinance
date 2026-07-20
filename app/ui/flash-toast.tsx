"use client";

import { X } from "lucide-react";
import { useEffect, useState } from "react";

export function FlashToast({ message }: { message?: string }) {
  const [dismissedMessage, setDismissedMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!message) return;
    const timeoutId = setTimeout(() => setDismissedMessage(message), 5000);
    return () => clearTimeout(timeoutId);
  }, [message]);

  if (!message || dismissedMessage === message) return null;

  return (
    <div role="status" className="fixed left-5 top-5 z-[80] w-[min(460px,calc(100vw-40px))] rounded-lg border border-[#bdd6ee] bg-white p-4 text-right shadow-2xl">
      <div className="flex items-start gap-3">
        <button
          type="button"
          aria-label="إغلاق التنبيه"
          onClick={() => setDismissedMessage(message)}
          className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-[#f4f7fa] text-[#607086] transition hover:bg-[#e8eef4] hover:text-[#172033]"
        >
          <X size={17} />
        </button>
        <p className="min-w-0 flex-1 text-sm font-black leading-6 text-[#0b559f]">{message}</p>
      </div>
    </div>
  );
}
