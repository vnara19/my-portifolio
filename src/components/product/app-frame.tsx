import type { ReactNode } from "react";

import { TabViewport } from "@/components/product/tab-viewport";
import type { AreaKey } from "@/modules/access/domain/areas";

/** Investment-only frame. The top navigation replaces the former area sidebar. */
export async function AppFrame({ header, children }: {
  area: AreaKey;
  header: (menu: ReactNode | null) => ReactNode;
  children: ReactNode | ((menu: ReactNode | null) => ReactNode);
}) {
  return (
    <main className="app-canvas min-h-[100dvh] bg-background text-foreground">
      {header(null)}
      <TabViewport>{typeof children === "function" ? children(null) : children}</TabViewport>
    </main>
  );
}
