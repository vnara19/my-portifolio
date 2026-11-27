"use client";

/** Render browser-local dates after hydration because the server does not know the user's time zone. */

import { useSyncExternalStore } from "react";

import { cn } from "@/lib/utils";
import { formatRefreshDateTime } from "@/modules/quotes/presentation/refresh-time";

function subscribeNothing() {
  return () => {};
}


export function LocalDateTime({ iso, className }: { iso: string; className?: string }) {
  const hydrated = useSyncExternalStore(
    subscribeNothing,
    () => true,
    () => false,
  );

  return (
    <time dateTime={iso} className={cn(!hydrated && "invisible", className)}>
      {hydrated ? formatRefreshDateTime(iso) : "00/00/0000 at 00:00"}
    </time>
  );
}
