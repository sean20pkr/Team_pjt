import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "채널물량 인사이트 AI",
  description: "Supabase와 BizRouter로 작동하는 채널 물량 인사이트 에이전트",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" className="h-full antialiased">
      <body className="min-h-full bg-transparent text-slate-900">
        <header className="border-b border-blue-100 bg-white/90 backdrop-blur">
          <div className="mx-auto flex w-full max-w-7xl items-center justify-between px-6 py-4">
            <div>
              <p className="text-xs font-medium uppercase tracking-[0.2em] text-blue-600">
                Channel Volume Insight AI
              </p>
            </div>
            <nav className="flex items-center gap-3 text-sm">
              <Link
                href="/"
                className="rounded-full border border-blue-100 bg-white px-4 py-2 text-slate-700 transition hover:border-blue-200 hover:bg-blue-50"
              >
                Agent
              </Link>
              <Link
                href="/login"
                className="rounded-full bg-blue-700 px-4 py-2 font-medium text-white transition hover:bg-blue-800"
              >
                Login
              </Link>
            </nav>
          </div>
        </header>
        <main>{children}</main>
      </body>
    </html>
  );
}
