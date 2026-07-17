"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";
import { useFormStatus } from "react-dom";

type ButtonVariant = "primary" | "secondary" | "danger";

export function SubmitButton({
  children,
  pendingText,
  className = "",
  variant = "primary",
  ...props
}: {
  children: ReactNode;
  pendingText?: ReactNode;
  className?: string;
  variant?: ButtonVariant;
} & ButtonHTMLAttributes<HTMLButtonElement>) {
  const { pending } = useFormStatus();
  const variants: Record<ButtonVariant, string> = {
    primary: "bg-[#0b559f] text-white shadow-sm hover:bg-[#0a3f78] hover:shadow-md",
    secondary:
      "border border-[#cbd7e3] bg-white text-[#324155] shadow-sm hover:border-[#0b559f] hover:text-[#0b559f] hover:shadow-md",
    danger:
      "border border-[#cbd7e3] bg-white text-[#324155] shadow-sm hover:border-[#c1121f] hover:text-[#c1121f] hover:shadow-md",
  };

  return (
    <button
      type="submit"
      {...props}
      disabled={pending}
      aria-busy={pending}
      className={`inline-flex items-center justify-center gap-2 rounded-lg px-4 py-3 text-sm font-black transition duration-200 hover:-translate-y-0.5 active:translate-y-0 disabled:pointer-events-none disabled:translate-y-0 disabled:cursor-wait disabled:opacity-75 ${variants[variant]} ${className}`}
    >
      {pending ? (
        <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
      ) : null}
      <span>{pending ? pendingText ?? children : children}</span>
    </button>
  );
}
