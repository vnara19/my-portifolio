import type { AppModule } from "@/generated/prisma/enums";

export type AreaKey = "investments";
export type AppArea = {
  key: AreaKey;
  label: string;
  href: string;
  group: string;
  module: AppModule | null;
};

/** Legacy grants remain in the database; only investments are exposed. */
export const APP_AREAS: readonly AppArea[] = [
  { key: "investments", label: "Investments", href: "/", group: "Finance", module: null },
];

export function areasFor(modules: readonly AppModule[]) {
  return APP_AREAS.filter((area) => area.module === null || modules.includes(area.module));
}
