import { Suspense } from "react";
import ActivityView from "./activity-view";

export default function Page() {
  return (
    <Suspense fallback={<p className="text-sm text-zinc-500">Loading…</p>}>
      <ActivityView />
    </Suspense>
  );
}
