"use client";

import { CheckCircleIcon, WarningCircleIcon, XIcon } from "@phosphor-icons/react/dist/ssr";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect } from "react";

import { cn } from "@/lib/utils";

export type EditToastState = {
  id: number;
  tone: "success" | "error";
  message: string;
  undoToken?: string;
};

const AUTO_DISMISS_MS = 9000;
const HANDOFF_KEY = "portfolio:edit-toast";


export function handOffToast(toast: Omit<EditToastState, "id">) {
  try {
    sessionStorage.setItem(HANDOFF_KEY, JSON.stringify(toast));
  } catch {

  }
}


export function takeHandedOffToast(): Omit<EditToastState, "id"> | null {
  try {
    const raw = sessionStorage.getItem(HANDOFF_KEY);
    sessionStorage.removeItem(HANDOFF_KEY);
    return raw ? (JSON.parse(raw) as Omit<EditToastState, "id">) : null;
  } catch {
    return null;
  }
}

export function EditToast({
  toast,
  onDismiss,
  onUndo,
  undoing,
}: {
  toast: EditToastState | null;
  onDismiss: () => void;
  onUndo: (token: string) => void;
  undoing: boolean;
}) {
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    if (!toast || toast.tone === "error" || toast.undoToken) {
      return;
    }

    const timer = window.setTimeout(onDismiss, AUTO_DISMISS_MS);
    return () => window.clearTimeout(timer);
  }, [toast, onDismiss]);

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom,0px)+88px)] z-50 flex justify-center px-4">
      <AnimatePresence>
        {toast ? (
          <motion.div
            key={toast.id}
            role="status"
            aria-live="polite"
            initial={reduceMotion ? false : { opacity: 0, y: 12, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 8, scale: 0.98 }}
            transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}
            className={cn(
              "pointer-events-auto flex max-w-lg items-center gap-3 rounded-2xl border bg-card/95 px-4 py-3 shadow-2xl backdrop-blur-xl",
              toast.tone === "error" ? "border-destructive/40" : "border-border",
            )}
          >
            {toast.tone === "error" ? (
              <WarningCircleIcon aria-hidden="true" className="shrink-0 text-destructive" size={18} weight="fill" />
            ) : (
              <CheckCircleIcon aria-hidden="true" className="shrink-0 text-primary" size={18} weight="fill" />
            )}
            <p className="text-xs text-foreground">{toast.message}</p>
            {toast.undoToken ? (
              <button
                type="button"
                disabled={undoing}
                onClick={() => onUndo(toast.undoToken!)}
                className="ml-1 shrink-0 rounded-lg px-2 py-1 text-xs font-semibold text-primary outline-none transition-colors hover:bg-primary/10 focus-visible:ring-2 focus-visible:ring-ring/50 disabled:opacity-50"
              >
                {undoing ? "Undoing…" : "Undo"}
              </button>
            ) : null}
            <button
              type="button"
              aria-label="Dismiss notice"
              onClick={onDismiss}
              className="grid size-6 shrink-0 place-items-center rounded-md text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
            >
              <XIcon aria-hidden="true" size={12} weight="bold" />
            </button>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
