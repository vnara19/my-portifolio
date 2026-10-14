"use client";

import { ArchiveIcon, PlusIcon, WalletIcon } from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";

import { headerPrimaryButtonClass } from "@/modules/portfolio/ui/edit-dialogs";

const secondaryClass =
  "inline-flex h-9 items-center gap-2 rounded-xl border border-border bg-card/70 px-3.5 text-xs font-semibold text-foreground outline-none transition-colors hover:bg-white/[0.05] focus-visible:ring-2 focus-visible:ring-ring/50";


export function EmptyPortfolio({
  title = "Your portfolio is empty",
  onAdd,
  adding = false,
}: {
  title?: string;

  onAdd?: () => void;
  adding?: boolean;
}) {
  return (
    <div className="mx-auto flex min-h-[60dvh] max-w-xl flex-col items-center justify-center px-5 py-16 text-center">
      <span className="grid size-12 place-items-center rounded-2xl border border-border bg-card text-primary">
        <WalletIcon aria-hidden="true" size={22} weight="duotone" />
      </span>
      <h1 className="mt-6 text-2xl font-semibold tracking-[-0.04em]">{title}</h1>
      <p className="mt-3 text-sm leading-6 text-muted-foreground">Add your first position or restore a backup exported from the application.
      </p>
      <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
        {onAdd ? (
          <button type="button" onClick={onAdd} disabled={adding} className={headerPrimaryButtonClass}>
            <PlusIcon aria-hidden="true" size={14} weight="bold" />
            {adding ? "Preparando…" : "Add position"}
          </button>
        ) : (
          <Link href="/posicoes?incluir=1" className={headerPrimaryButtonClass}>
            <PlusIcon aria-hidden="true" size={14} weight="bold" />Add position
          </Link>
        )}
        <Link href="/configuracao#backup" className={secondaryClass}>
          <ArchiveIcon aria-hidden="true" className="text-primary" size={16} weight="duotone" />Import backup
        </Link>
      </div>
    </div>
  );
}
