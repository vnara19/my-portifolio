"use client";

import { ArrowClockwiseIcon } from "@phosphor-icons/react/dist/ssr";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { showAppToast } from "@/components/product/app-toaster";
import { refreshUnlessEditing } from "@/components/product/quote-refresh-client";
import { hasPendingChanges } from "@/components/product/unsaved-changes";
import { Button } from "@/components/ui/button";
import { devToolsEnabled } from "@/lib/dev-tools";

type DevSyncResponse = { ok: boolean; state: string; lines?: string[]; message?: string };


export function DevQuoteSyncButton({ className }: { className?: string }) {
  const router = useRouter();
  const [running, setRunning] = useState(false);

  if (!devToolsEnabled()) return null;

  const sync = async () => {
    if (hasPendingChanges()) {
      showAppToast({ tone: "info", title: "Save your changes first", description: "Then update quotes." });
      return;
    }
    setRunning(true);
    try {
      const response = await fetch("/api/quotes/dev-sync", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      });
      const body = await response.json() as DevSyncResponse;
      if (!response.ok && !body.lines) throw new Error(body.message ?? "The application could not update quotes.");
      showAppToast({
        tone: body.ok ? "success" : "warning",
        title: body.state === "busy" ? "Update already in progress" : body.ok ? "Local update completed" : "Update completed with warnings",
        description: body.message,
        data: { items: body.lines?.map((line) => ({ label: line })) },
      });
      refreshUnlessEditing(() => router.refresh());
    } catch (error) {
      showAppToast({ tone: "error", title: "Could not update quotes", description: error instanceof Error ? error.message : "Try again." });
    } finally {
      setRunning(false);
    }
  };

  return (
    <Button variant="outline" onClick={() => void sync()} disabled={running} className={className}>
      <ArrowClockwiseIcon aria-hidden="true" className={running ? "animate-spin motion-reduce:animate-none" : undefined} />
      {running ? "Updating…" : "Update quotes (dev)"}
    </Button>
  );
}
