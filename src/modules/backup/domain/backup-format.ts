
/** Stable backup contracts and table order. Preserve historical keys so existing version-5 JSON exports remain compatible. */


export const BACKUP_FORMAT = "meu-portfolio-backup";


export const BACKUP_VERSION = 5;


export const BACKUP_TABLES = [
  { key: "dataImports", label: null, shared: false },
  { key: "institutions", label: "Institutions", shared: false },
  { key: "accounts", label: null, shared: false },
  { key: "assets", label: "Assets", shared: false },
  { key: "portfolioMonths", label: "Reporting months", shared: false },
  { key: "positions", label: "Positions", shared: false },
  { key: "positionAllocations", label: "Allocations", shared: false },
  { key: "positionTransactions", label: "Transactions", shared: false },
  { key: "targetPlans", label: "Targets", shared: false },
  { key: "allocationTargets", label: null, shared: false },
  { key: "manualQuotes", label: "Manual quotes", shared: false },
  { key: "marketQuotes", label: "Monthly quotes", shared: true },
  { key: "dailyQuotes", label: "Daily quotes", shared: true },
] as const;

export type BackupTableKey = (typeof BACKUP_TABLES)[number]["key"];

export type BackupRow = Record<string, unknown>;

export type BackupFile = {
  format: typeof BACKUP_FORMAT;
  version: typeof BACKUP_VERSION;
  exportedAt: string;
  tables: Record<BackupTableKey, BackupRow[]>;
};

export type BackupCounts = Record<BackupTableKey, number>;

export type BackupPreview = {
  exportedAt: string;

  version: number;

  firstMonth: string | null;
  lastMonth: string | null;
  file: BackupCounts;

  current: BackupCounts;
};

export type BackupRestoreResponse =
  | { state: "checked"; preview: BackupPreview }
  | { state: "restored"; counts: BackupCounts }
  | { state: "invalid"; message: string };


export function backupFileName(date: Date) {
  const stamp = date.toISOString().slice(0, 16).replace("T", "-").replace(":", "");
  return `${BACKUP_FORMAT}-${stamp}.json`;
}
