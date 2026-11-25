"use client";

import { useSearchParams } from "next/navigation";

export default function LoginForm() {
  const params = useSearchParams();
  const error = params.get("error");
  const next = params.get("next") ?? "/";
  return (
    <div className="mx-auto mt-24 max-w-sm space-y-4 text-center">
      <h1 className="text-xl font-semibold">Sign in</h1>
      <p className="text-sm text-zinc-500">
        Sign in with Google. With a company account, you share personas and conversations with colleagues on the same domain; a
        personal account gets a private space.
      </p>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <a
        href={`/api/auth/login?next=${encodeURIComponent(next)}`}
        className="inline-block rounded bg-zinc-900 px-4 py-2 text-white dark:bg-zinc-100 dark:text-zinc-900"
      >
        Sign in with Google
      </a>
    </div>
  );
}
