"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

export function NavigationProgress() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pendingTarget, setPendingTarget] = useState<string | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const currentTarget = `${pathname}${searchParams.size ? `?${searchParams.toString()}` : ""}`;
  const pending = Boolean(pendingTarget && pendingTarget !== currentTarget);

  useEffect(() => {
    function startPending(target: string) {
      setPendingTarget(target);
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      timeoutRef.current = setTimeout(() => setPendingTarget(null), 9000);
    }

    function handleClick(event: MouseEvent) {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
        return;
      }

      const target = event.target instanceof Element ? event.target.closest("a") : null;
      if (!target) {
        return;
      }

      const anchor = target as HTMLAnchorElement;
      if (anchor.target || anchor.hasAttribute("download")) {
        return;
      }

      const url = new URL(anchor.href, window.location.href);
      if (url.origin !== window.location.origin || url.href === window.location.href) {
        return;
      }

      startPending(`${url.pathname}${url.search}`);
    }

    document.addEventListener("click", handleClick, true);

    return () => {
      document.removeEventListener("click", handleClick, true);
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  if (!pending) {
    return null;
  }

  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-[80]">
      <div className="h-1 overflow-hidden bg-[#dbe8f6]">
        <div className="h-full w-1/2 animate-[navigation-bar_1.1s_ease-in-out_infinite] rounded-full bg-[#0b559f]" />
      </div>
    </div>
  );
}
