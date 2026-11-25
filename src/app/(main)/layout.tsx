import Link from "next/link";
import type { ReactNode } from "react";
import { NewPersonaButton } from "@/components/new-persona-button";
import { AccountMenu } from "@/components/account-menu";

/** Standard pages: header + centered content. The chat route opts out for a full-screen view. */
export default function MainLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <header className="border-b border-zinc-200 dark:border-zinc-800">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <Link href="/" className="font-semibold tracking-tight">The Impersonator</Link>
          <div className="flex items-center gap-2">
            <AccountMenu />
            <NewPersonaButton />
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6 pb-[max(1.5rem,env(safe-area-inset-bottom))]">{children}</main>
    </>
  );
}
