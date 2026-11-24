import { Suspense } from "react";
import PersonaView from "./persona-view";

export default function Page() {
  return (
    <Suspense fallback={<p className="text-sm text-zinc-500">Loading…</p>}>
      <PersonaView />
    </Suspense>
  );
}
