import type { Metadata } from "next";
import { Suspense } from "react";
import { NavigationProgress } from "@/app/ui/navigation-progress";
import "./globals.css";

export const metadata: Metadata = {
  title: "نظام صيانة الزيت والشحم",
  description: "نظام إدارة صيانة كامل لشركة أسمنت المنطقة الجنوبية",
  icons: {
    icon: "/favicon.ico",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ar" dir="rtl" className="h-full antialiased">
      <body className="min-h-full flex flex-col">
        <Suspense fallback={null}>
          <NavigationProgress />
        </Suspense>
        {children}
      </body>
    </html>
  );
}
