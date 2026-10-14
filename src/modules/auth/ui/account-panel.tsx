"use client";

import { CircleNotchIcon, SignOutIcon, UserCircleIcon } from "@phosphor-icons/react/dist/ssr";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { showAppToast } from "@/components/product/app-toaster";
import { authClient } from "@/modules/auth/auth-client";
import { secondaryButtonClass } from "@/modules/portfolio/ui/edit-dialogs";


export function AccountPanel({ name, email }: { name: string; email: string }) {
  const router = useRouter();
  const [leaving, setLeaving] = useState(false);

  async function signOut() {
    setLeaving(true);
    const result = await authClient.signOut();

    if (result.error) {
      setLeaving(false);
      showAppToast({ tone: "error", title: "Could not sign out right now. Try again." });
      return;
    }

    router.replace("/entrar");
    router.refresh();
  }

  return (
    <section className="premium-panel rounded-[24px] p-5 sm:p-6" aria-labelledby="account-title">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          <UserCircleIcon aria-hidden="true" className="shrink-0 text-primary" size={28} weight="duotone" />
          <div className="min-w-0">
            <h2 id="account-title" className="truncate text-base font-semibold tracking-[-0.025em]">
              {name}
            </h2>
            <p className="truncate text-[11px] text-muted-foreground">{email}</p>
          </div>
        </div>
        <button type="button" onClick={signOut} disabled={leaving} className={secondaryButtonClass}>
          {leaving ? (
            <CircleNotchIcon aria-hidden="true" size={14} className="mr-1.5 animate-spin" />
          ) : (
            <SignOutIcon aria-hidden="true" size={14} className="mr-1.5" />
          )}Sign out
        </button>
      </div>
    </section>
  );
}
