"use client";

/** Global toast provider keeps notices visible across tab changes. Low-priority announcements preserve accessible controls. */

import { englishLabel } from "@/lib/english-labels";

import { Toast } from "@base-ui/react/toast";
import {
  CheckCircleIcon,
  InfoIcon,
  WarningCircleIcon,
  WarningIcon,
  XIcon,
} from "@phosphor-icons/react/dist/ssr";

import { cn } from "@/lib/utils";

export type AppToastTone = "success" | "error" | "warning" | "info";

export type AppToastItem = {
  label: string;
  detail?: string;
  reason?: string;
};

export type AppToastData = {
  items?: AppToastItem[];
  footnote?: string;
};


export const appToasts = Toast.createToastManager<AppToastData>();

const TIMEOUTS: Record<AppToastTone, number> = {
  success: 6000,
  info: 9000,
  warning: 0,
  error: 0,
};

export function showAppToast({
  id,
  tone,
  title,
  description,
  data,
}: {
  id?: string;
  tone: AppToastTone;
  title: string;
  description?: string;
  data?: AppToastData;
}) {
  return appToasts.add({
    id,
    type: tone,
    title,
    description,
    data,
    timeout: TIMEOUTS[tone],


    priority: "low",
  });
}

export function AppToaster() {
  return (
    <Toast.Provider toastManager={appToasts} limit={3}>
      <Toast.Portal>
        <Toast.Viewport className="fixed top-[calc(env(safe-area-inset-top,0px)+4.75rem)] right-4 left-4 z-50 mx-auto outline-none sm:right-6 sm:left-auto sm:w-[24rem]">
          <ToastList />
        </Toast.Viewport>
      </Toast.Portal>
    </Toast.Provider>
  );
}

function ToastList() {
  const { toasts } = Toast.useToastManager<AppToastData>();

  return toasts.map((toast) => {
    const tone = (toast.type ?? "info") as AppToastTone;
    const items = toast.data?.items ?? [];

    return (
      <Toast.Root
        key={toast.id}
        toast={toast}
        swipeDirection={["up", "right"]}
        data-testid="app-toast"
        className={cn(

          "[--gap:0.625rem] [--peek:0.5rem] [--scale:calc(max(0,1-(var(--toast-index)*0.06)))] [--shrink:calc(1-var(--scale))] [--height:var(--toast-frontmost-height,var(--toast-height))] [--offset-y:calc(var(--toast-offset-y)+(var(--toast-index)*var(--gap))+var(--toast-swipe-movement-y))]",
          "absolute top-0 right-0 left-0 z-[calc(1000-var(--toast-index))] mx-auto h-[var(--height)] w-full origin-top overflow-hidden rounded-2xl border bg-card/95 shadow-2xl backdrop-blur-xl select-none",
          "[transform:translateX(var(--toast-swipe-movement-x))_translateY(calc(var(--toast-swipe-movement-y)+(var(--toast-index)*var(--peek))+(var(--shrink)*var(--height))))_scale(var(--scale))]",
          "data-expanded:h-[var(--toast-height)] data-expanded:[transform:translateX(var(--toast-swipe-movement-x))_translateY(var(--offset-y))]",
          "data-limited:opacity-0 data-starting-style:opacity-0 data-starting-style:[transform:translateY(-40%)_scale(0.98)]",
          "data-ending-style:opacity-0 [&[data-ending-style]:not([data-limited]):not([data-swipe-direction])]:[transform:translateY(-40%)_scale(0.98)]",
          "data-ending-style:data-[swipe-direction=up]:[transform:translateY(calc(var(--toast-swipe-movement-y)-150%))]",
          "data-ending-style:data-[swipe-direction=right]:[transform:translateX(calc(var(--toast-swipe-movement-x)+150%))_translateY(var(--offset-y))]",
          "after:absolute after:bottom-full after:left-0 after:h-[calc(var(--gap)+1px)] after:w-full after:content-['']",
          "[transition:transform_0.35s_cubic-bezier(0.23,1,0.32,1),opacity_0.25s,height_0.15s] motion-reduce:[transition:opacity_0.2s]",
          tone === "error"
            ? "border-destructive/40"
            : tone === "warning"
              ? "border-warning-border"
              : "border-border",
        )}
      >
        <Toast.Content className="flex items-start gap-3 px-4 py-3 transition-opacity duration-200 data-behind:opacity-0 data-expanded:opacity-100">
          <ToneIcon tone={tone} />
          <div className="min-w-0 flex-1">
            <Toast.Title className="text-xs font-semibold text-foreground" />
            <Toast.Description className="mt-0.5 text-xs text-muted-foreground" />
            {items.length > 0 ? (
              <ul
                data-base-ui-swipe-ignore
                className="mt-2 max-h-[min(40dvh,15rem)] space-y-1.5 overflow-y-auto overscroll-contain pr-1 select-text"
              >
                {items.map((item) => (
                  <li key={item.label} className="text-xs leading-snug">
                    <span className="font-mono font-semibold text-foreground">{englishLabel(item.label)}</span>
                    {item.detail ? <span className="text-muted-foreground"> · {item.detail}</span> : null}
                    {item.reason ? <span className="block text-[11px] text-muted-foreground/80">{item.reason}</span> : null}
                  </li>
                ))}
              </ul>
            ) : null}
            {toast.data?.footnote ? (
              <p className="mt-2 text-[11px] text-muted-foreground">{toast.data.footnote}</p>
            ) : null}
          </div>
          <Toast.Close
            aria-label="Dismiss notice"
            className="-mr-1 grid size-6 shrink-0 place-items-center rounded-md text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
          >
            <XIcon aria-hidden="true" size={12} weight="bold" />
          </Toast.Close>
        </Toast.Content>
      </Toast.Root>
    );
  });
}

function ToneIcon({ tone }: { tone: AppToastTone }) {
  if (tone === "error") {
    return <WarningCircleIcon aria-hidden="true" className="mt-px shrink-0 text-destructive" size={18} weight="fill" />;
  }

  if (tone === "warning") {
    return <WarningIcon aria-hidden="true" className="mt-px shrink-0 text-warning-foreground" size={18} weight="fill" />;
  }

  if (tone === "success") {
    return <CheckCircleIcon aria-hidden="true" className="mt-px shrink-0 text-primary" size={18} weight="fill" />;
  }

  return <InfoIcon aria-hidden="true" className="mt-px shrink-0 text-primary" size={18} weight="fill" />;
}
