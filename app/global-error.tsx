"use client";

export default function GlobalError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  return (
    <html lang="ar" dir="rtl">
      <body style={{ margin: 0, background: "#f4f6f8", color: "#172033", fontFamily: "Cairo, Segoe UI, Tahoma, Arial, sans-serif" }}>
        <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24 }}>
          <section style={{ width: "min(560px, 100%)", border: "1px solid #dbe3ea", borderRadius: 8, background: "#fff", padding: 24, boxShadow: "0 8px 24px rgba(15, 23, 42, 0.08)" }}>
            <h1 style={{ margin: 0, color: "#0b559f", fontSize: 24, fontWeight: 900 }}>حدث خطأ غير متوقع</h1>
            <p style={{ margin: "12px 0 0", color: "#607086", fontSize: 14, fontWeight: 700, lineHeight: 1.8 }}>
              يرجى إعادة المحاولة. إذا استمرت المشكلة، أرسل رقم الخطأ للدعم الفني.
            </p>
            {error.digest ? (
              <p style={{ margin: "12px 0 0", color: "#607086", fontSize: 12, fontWeight: 700 }}>رقم الخطأ: {error.digest}</p>
            ) : null}
            <button
              type="button"
              onClick={() => unstable_retry()}
              style={{ marginTop: 20, border: 0, borderRadius: 8, background: "#0b559f", color: "#fff", padding: "10px 16px", fontSize: 14, fontWeight: 900, cursor: "pointer" }}
            >
              إعادة المحاولة
            </button>
          </section>
        </main>
      </body>
    </html>
  );
}
