"use client";

import { tv } from "tailwind-variants";
import { createContext, useContext, type ReactNode } from "react";
export const fieldFeedbackBadge = tv({ base: "inline-flex shrink-0 items-center gap-1 tracking-normal normal-case", variants: { valid: { true: "text-primary", false: "text-destructive" } } });
export type FieldFeedback = { valid: boolean; message?: string; automatic?: boolean };
const Context = createContext<Record<string, FieldFeedback>>({});
export const fieldKey = (label: string) => label.replace(/\s*\([^)]*\)/g, "").trim().toLowerCase();
export function FieldFeedbackProvider({ fields, children }: { fields: Record<string, FieldFeedback>; children: ReactNode }) {
  return <Context.Provider value={Object.fromEntries(Object.entries(fields).map(([key, value]) => [fieldKey(key), value]))}>{children}</Context.Provider>;
}
export function useFieldFeedback(label: string) { return useContext(Context)[fieldKey(label)]; }
