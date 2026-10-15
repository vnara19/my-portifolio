import Link from "next/link";
import { Suspense } from "react";

import { MainTabs, type TabKey } from "@/components/product/main-tabs";

/** A prefetchable shell gives immediate feedback while private page data loads. */
export function PageLoading({ active = "overview" }: { active?: TabKey }) {
  return <div className="min-h-screen bg-background">
    <header className="flex h-16 items-center justify-center gap-3 border-b border-border px-4">
      <Suspense fallback={null}><MainTabs active={active} /></Suspense>
      <Link href="/configuracao" className="rounded-lg p-2 text-sm text-muted-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring">Settings</Link>
    </header>
    <main aria-busy="true" className="mx-auto max-w-[1800px] space-y-6 p-4 sm:p-6">
      <p role="status" className="text-sm text-muted-foreground">Loading portfolio…</p>
      <div aria-hidden="true" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map((key) => <div key={key} className="h-28 rounded-2xl border border-border bg-card motion-safe:animate-pulse" />)}
      </div>
      <div aria-hidden="true" className="h-72 rounded-2xl border border-border bg-card motion-safe:animate-pulse" />
    </main>
  </div>;
}
