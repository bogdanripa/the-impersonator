import Link from "next/link";
import type { ReactNode } from "react";

/** Standard pages: header + centered content. The chat route opts out for a full-screen view. */
export default function MainLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <header className="border-b border-zinc-200 dark:border-zinc-800">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <Link href="/" className="font-semibold tracking-tight">The Impersonator</Link>
          <span className="text-xs text-zinc-500">Grounded in real interviews. No guessing.</span>
        </div>
      </header>
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6">{children}</main>
    </>
  );
}
