"use client";


import { ArchiveIcon, UploadSimpleIcon } from "@phosphor-icons/react/dist/ssr";

import { primaryButtonClass } from "@/modules/portfolio/ui/edit-dialogs";

export function BackupPanel() {
  return (
    <section id="backup" className="premium-panel scroll-mt-32 rounded-[24px] p-5 sm:p-6" aria-labelledby="backup-title">
      <div className="flex items-center gap-2">
        <ArchiveIcon aria-hidden="true" className="text-primary" size={16} weight="duotone" />
        <h2 id="backup-title" className="text-base font-semibold tracking-[-0.025em]">Data backup</h2>
      </div>
      <div className="mt-5 flex">
        <a href="/api/backup" download className={primaryButtonClass}>
          <UploadSimpleIcon aria-hidden="true" size={14} weight="bold" />Export backup
        </a>
      </div>
    </section>
  );
}
