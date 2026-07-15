import type { Metadata } from "next";
import { Cairo } from "next/font/google";
import { Suspense } from "react";
import { NavigationProgress } from "@/app/ui/navigation-progress";
import "./globals.css";

const cairo = Cairo({
  variable: "--font-cairo",
  subsets: ["arabic", "latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "نظام صيانة الزيت والشحم",
  description: "نظام إدارة صيانة كامل لشركة أسمنت المنطقة الجنوبية",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ar" dir="rtl" className={`${cairo.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        <Suspense fallback={null}>
          <NavigationProgress />
        </Suspense>
        {children}
      </body>
    </html>
  );
}
