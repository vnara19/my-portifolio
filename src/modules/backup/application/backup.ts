
/** Versioned per-user backup. Validate every table, field and reference before a transactional replacement; shared quotes are inserted only when missing. */
import { randomUUID } from "node:crypto";

import { Prisma } from "@/generated/prisma/client";
import { DEFAULT_TARGETS_LOCK_KEY, MONTH_ROLLOVER_LOCK_KEY, QUOTE_REFRESH_LOCK_KEY } from "@/lib/advisory-locks";
import { getUserDb, SCOPED_USER } from "@/lib/user-db";
import {
  BACKUP_FORMAT,
  BACKUP_TABLES,
  BACKUP_VERSION,
  type BackupCounts,
  type BackupFile,
  type BackupPreview,
  type BackupRow,
  type BackupTableKey,
} from "@/modules/backup/domain/backup-format";
import { ensureDefaultTargetPlan } from "@/modules/portfolio/application/target-plan-editing";


// Roll back the entire restore if any row fails.
//


//


// Schema changes follow docs/backup-format.md.

type Transaction = Prisma.TransactionClient;

type Delegate = {
  findMany(args: { where?: object; orderBy: { id: "asc" } }): Promise<BackupRow[]>;
  createMany(args: { data: BackupRow[]; skipDuplicates?: boolean }): Promise<{ count: number }>;
  deleteMany(): Promise<{ count: number }>;
  count(args?: { where?: object }): Promise<number>;
};

type TableSpec = {
  model: string;

  table: string;
  fields: Record<string, string>;

  omit?: string[];

  bigints?: string[];

  nullableJson?: string[];

  references?: Record<string, BackupTableKey>;
};


const OWNED = ["userId"];

const TABLE_SPECS: Record<BackupTableKey, TableSpec> = {
  dataImports: { model: "dataImport", table: "data_imports", fields: Prisma.DataImportScalarFieldEnum, omit: OWNED },
  institutions: {
    model: "institution",
    table: "institutions",
    fields: Prisma.InstitutionScalarFieldEnum,
    omit: OWNED,
  },
  accounts: {
    model: "account",
    table: "accounts",
    fields: Prisma.AccountScalarFieldEnum,
    omit: OWNED,
    references: { institutionId: "institutions" },
  },
  assets: { model: "asset", table: "assets", fields: Prisma.AssetScalarFieldEnum, omit: OWNED, nullableJson: ["fixedIncomeContract"] },
  portfolioMonths: {
    model: "portfolioMonth",
    table: "portfolio_months",
    fields: Prisma.PortfolioMonthScalarFieldEnum,
    omit: OWNED,
  },
  positions: {
    model: "position",
    table: "positions",
    fields: Prisma.PositionScalarFieldEnum,
    omit: OWNED,
    references: { portfolioMonthId: "portfolioMonths", accountId: "accounts", assetId: "assets" },
  },
  positionAllocations: {
    model: "positionAllocation",
    table: "position_allocations",
    fields: Prisma.PositionAllocationScalarFieldEnum,
    omit: OWNED,
    references: { positionId: "positions" },
  },
  positionTransactions: {
    model: "positionTransaction",
    table: "position_transactions",
    fields: Prisma.PositionTransactionScalarFieldEnum,
    omit: OWNED,
    references: { positionId: "positions" },
  },
  targetPlans: { model: "targetPlan", table: "target_plans", fields: Prisma.TargetPlanScalarFieldEnum, omit: OWNED },
  allocationTargets: {
    model: "allocationTarget",
    table: "allocation_targets",
    fields: Prisma.AllocationTargetScalarFieldEnum,
    omit: OWNED,
    references: { planId: "targetPlans" },
  },
  manualQuotes: { model: "manualQuote", table: "manual_quotes", fields: Prisma.ManualQuoteScalarFieldEnum, omit: OWNED },
  marketQuotes: { model: "marketQuote", table: "market_quotes", fields: Prisma.MarketQuoteScalarFieldEnum },

  dailyQuotes: { model: "dailyQuote", table: "daily_quotes", fields: Prisma.DailyQuoteScalarFieldEnum, omit: ["runId"] },
};

const INSERT_CHUNK = 1_000;

type RawTables = Record<string, unknown>;

function dropFields(rows: unknown, fields: string[]) {
  return Array.isArray(rows)
    ? rows.map((row) =>
        row && typeof row === "object"
          ? Object.fromEntries(Object.entries(row as BackupRow).filter(([field]) => !fields.includes(field)))
          : row,
      )
    : rows;
}


function keepActiveTargetPlans(tables: RawTables): RawTables {
  const plans = tables.targetPlans;

  if (!Array.isArray(plans)) {
    return tables;
  }

  const inactive = new Set(
    plans
      .filter((plan) => plan && typeof plan === "object" && (plan as BackupRow).isActive === false)
      .map((plan) => (plan as BackupRow).id),
  );

  if (inactive.size === 0) {
    return tables;
  }

  const targets = tables.allocationTargets;

  return {
    ...tables,
    targetPlans: plans.filter((plan) => !inactive.has((plan as BackupRow | null)?.id)),
    allocationTargets: Array.isArray(targets)
      ? targets.filter((target) => !inactive.has((target as BackupRow | null)?.planId))
      : targets,
  };
}


const UPGRADES: Record<number, (tables: RawTables) => RawTables> = {


  1: (tables) => {
    const { importBatches: _batches, importSourceRows: _rows, importIssues: _issues, ...rest } = tables;
    void _batches;
    void _rows;
    void _issues;

    return {
      ...rest,
      dataImports: [],
      portfolioMonths: dropFields(tables.portfolioMonths, ["sourceBatchId"]),
      targetPlans: dropFields(tables.targetPlans, ["sourceBatchId"]),
      positions: dropFields(tables.positions, ["sourceRowId"]),
      positionAllocations: dropFields(tables.positionAllocations, ["sourceRowId"]),
      marketQuotes: dropFields(tables.marketQuotes, ["sourceRowId"]),
      allocationTargets: dropFields(tables.allocationTargets, ["sourceSheet", "sourceCell"]),
    };
  },


  2: (tables) => {
    const { monthlyUpdateRuns: _runs, quoteUpdateResults: _results, ...rest } = tables;
    void _runs;
    void _results;
    const months = tables.portfolioMonths;

    return {
      ...rest,
      portfolioMonths: Array.isArray(months)
        ? months.map((month) =>
            month && typeof month === "object" && (month as BackupRow).status === "IMPORTED"
              ? { ...(month as BackupRow), status: "REVIEWED" }
              : month,
          )
        : months,
    };
  },


  3: (tables) => {
    const { quoteRefreshRuns: _runs, quoteRefreshResults: _results, ...rest } = tables;
    void _runs;
    void _results;

    return {
      ...Object.fromEntries(Object.entries(rest).map(([key, rows]) => [key, dropFields(rows, ["userId"])])),
      dailyQuotes: dropFields(rest.dailyQuotes, ["userId", "runId"]),
      manualQuotes: [],
    };
  },


  4: (tables) => ({
    ...tables,
    positions: Array.isArray(tables.positions)
      ? tables.positions.map((position) =>
          position && typeof position === "object"
            ? {
                ...(position as BackupRow),
                openingQuantity: (position as BackupRow).quantity,
                calculationStartDate: null,
                calculatedIncomeBrl: "0",
                incomeCalculatedThrough: null,
                incomeCalculationError: null,
              }
            : position,
        )
      : tables.positions,
    positionTransactions: [],
  }),
};

export class BackupValidationError extends Error {}

function delegate(client: Transaction, key: BackupTableKey) {
  return (client as unknown as Record<string, Delegate>)[TABLE_SPECS[key].model];
}

function fieldsOf(key: BackupTableKey) {
  const omitted = TABLE_SPECS[key].omit ?? [];
  return Object.values(TABLE_SPECS[key].fields).filter((field) => !omitted.includes(field));
}

function serializeValue(key: BackupTableKey, field: string, value: unknown) {
  if (typeof value === "bigint") {
    if (!TABLE_SPECS[key].bigints?.includes(field)) {

      throw new Error(`The field ${key}.${field} is a BigInt and is not included in the backup field list.`);
    }
    return value.toString();
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (Prisma.Decimal.isDecimal(value)) {
    return (value as Prisma.Decimal).toString();
  }
  return value;
}


async function quoteSymbolsOf(client: Transaction) {
  const [assets, manual] = await Promise.all([
    client.asset.findMany({ where: { quoteSymbol: { not: null } }, select: { quoteSymbol: true } }),
    client.manualQuote.findMany({ distinct: ["symbol"], select: { symbol: true } }),
  ]);
  return [
    ...new Set(["USD", ...assets.map((asset) => asset.quoteSymbol!), ...manual.map((quote) => quote.symbol)]),
  ].sort();
}

function scopeOf(key: BackupTableKey, symbols: string[]) {
  return BACKUP_TABLES.find((table) => table.key === key)!.shared ? { symbol: { in: symbols } } : undefined;
}


export async function exportBackup(now = new Date()): Promise<BackupFile | null> {
  const prisma = await getUserDb();

  if (!prisma) {
    return null;
  }

  const tables = await prisma.$transaction(
    async (transaction) => {
      const symbols = await quoteSymbolsOf(transaction);
      const result = {} as Record<BackupTableKey, BackupRow[]>;

      for (const { key } of BACKUP_TABLES) {
        const fields = new Set(fieldsOf(key));
        const rows = await delegate(transaction, key).findMany({
          where: scopeOf(key, symbols),
          orderBy: { id: "asc" },
        });
        result[key] = rows.map((row) =>
          Object.fromEntries(
            Object.entries(row)
              .filter(([field]) => fields.has(field))
              .map(([field, value]) => [field, serializeValue(key, field, value)]),
          ),
        );
      }

      return result;
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead, maxWait: 10_000, timeout: 60_000 },
  );

  return { format: BACKUP_FORMAT, version: BACKUP_VERSION, exportedAt: now.toISOString(), tables };
}


export function parseBackup(input: unknown): {
  file: BackupFile;
  rows: Record<BackupTableKey, BackupRow[]>;
  sourceVersion: number;
} {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new BackupValidationError("The file is not a backup from this application.");
  }

  const candidate = input as Record<string, unknown>;

  if (candidate.format !== BACKUP_FORMAT) {
    throw new BackupValidationError("The file is not a backup from this application.");
  }

  const sourceVersion = candidate.version;

  if (typeof sourceVersion !== "number" || !Number.isInteger(sourceVersion) || sourceVersion < 1) {
    throw new BackupValidationError("The backup does not specify its format version.");
  }

  if (sourceVersion > BACKUP_VERSION) {
    throw new BackupValidationError("The backup is from a newer version of the application.");
  }

  if (typeof candidate.exportedAt !== "string" || Number.isNaN(Date.parse(candidate.exportedAt))) {
    throw new BackupValidationError("The backup does not specify its export date.");
  }

  if (!candidate.tables || typeof candidate.tables !== "object" || Array.isArray(candidate.tables)) {
    throw new BackupValidationError("The backup does not contain data tables.");
  }

  let tables = candidate.tables as RawTables;

  for (let version = sourceVersion; version < BACKUP_VERSION; version += 1) {
    tables = UPGRADES[version](tables);
  }

  tables = keepActiveTargetPlans(tables);

  const known = new Set<string>(BACKUP_TABLES.map((table) => table.key));
  const unknownTable = Object.keys(tables).find((key) => !known.has(key));

  if (unknownTable) {
    throw new BackupValidationError(`The backup contains data unknown to this application version (${unknownTable}).`);
  }

  const rows = {} as Record<BackupTableKey, BackupRow[]>;
  const file = {} as Record<BackupTableKey, BackupRow[]>;

  for (const { key } of BACKUP_TABLES) {
    const list = (tables as Record<string, unknown>)[key] ?? [];

    if (!Array.isArray(list)) {
      throw new BackupValidationError(`The table ${key} in the backup is not a list.`);
    }

    const spec = TABLE_SPECS[key];
    const fields = new Set(fieldsOf(key));
    file[key] = list as BackupRow[];
    rows[key] = list.map((row, index) => {
      if (!row || typeof row !== "object" || Array.isArray(row)) {
        throw new BackupValidationError(`Row ${index + 1} in ${key} is not a record.`);
      }

      const record: BackupRow = {};

      for (const [field, value] of Object.entries(row as BackupRow)) {
        if (!fields.has(field)) {
          throw new BackupValidationError(`The field ${key}.${field} does not exist in this application version.`);
        }

        if (spec.bigints?.includes(field) && value !== null) {
          if (typeof value !== "string" || !/^\d+$/.test(value)) {
            throw new BackupValidationError(`The field ${key}.${field} in row ${index + 1} is not an integer.`);
          }
          record[field] = BigInt(value);
        } else if (spec.nullableJson?.includes(field) && value === null) {
          record[field] = Prisma.DbNull;
        } else {
          record[field] = value;
        }
      }

      return record;
    });
  }

  return {
    file: { format: BACKUP_FORMAT, version: BACKUP_VERSION, exportedAt: candidate.exportedAt, tables: file },
    rows,
    sourceVersion,
  };
}

function countsOf(tables: Record<BackupTableKey, unknown[]>): BackupCounts {
  return Object.fromEntries(BACKUP_TABLES.map(({ key }) => [key, tables[key].length])) as BackupCounts;
}


async function currentCounts(client: Transaction): Promise<BackupCounts> {
  const symbols = await quoteSymbolsOf(client);
  const counts = {} as BackupCounts;
  for (const { key } of BACKUP_TABLES) {
    counts[key] = await delegate(client, key).count({ where: scopeOf(key, symbols) });
  }
  return counts;
}


export async function previewBackup(input: unknown): Promise<BackupPreview | null> {
  const prisma = await getUserDb();

  if (!prisma) {
    return null;
  }

  const { file, sourceVersion } = parseBackup(input);
  const months = file.tables.portfolioMonths
    .map((month) => (typeof month.referenceDate === "string" ? month.referenceDate.slice(0, 7) : null))
    .filter((month): month is string => month !== null)
    .sort();

  return {
    exportedAt: file.exportedAt,
    version: sourceVersion,
    firstMonth: months[0] ?? null,
    lastMonth: months.at(-1) ?? null,
    file: countsOf(file.tables),
    current: await currentCounts(prisma as unknown as Transaction),
  };
}


async function replaceTakenIds(transaction: Transaction, rows: Record<BackupTableKey, BackupRow[]>) {
  const replaced = new Map<BackupTableKey, Map<string, string>>();
  const result = {} as Record<BackupTableKey, BackupRow[]>;

  for (const { key, shared } of BACKUP_TABLES) {
    const spec = TABLE_SPECS[key];
    let tableRows = rows[key];

    if (shared) {
      result[key] = tableRows;
      continue;
    }

    for (const [field, target] of Object.entries(spec.references ?? {})) {
      const map = replaced.get(target);
      if (map && map.size > 0) {
        tableRows = tableRows.map((row) => {
          const value = row[field];
          return typeof value === "string" && map.has(value) ? { ...row, [field]: map.get(value) } : row;
        });
      }
    }

    const ids = tableRows.map((row) => row.id).filter((id): id is string => typeof id === "string");
    const taken =
      ids.length > 0
        ? await transaction.$queryRawUnsafe<{ id: string }[]>(
            `SELECT "id"::text AS "id" FROM "${spec.table}" WHERE "id" = ANY($1::uuid[])`,
            ids,
          )
        : [];
    const map = new Map(taken.map(({ id }) => [id, randomUUID()]));

    if (map.size > 0) {
      tableRows = tableRows.map((row) =>
        typeof row.id === "string" && map.has(row.id) ? { ...row, id: map.get(row.id) } : row,
      );
    }

    replaced.set(key, map);
    result[key] = tableRows;
  }

  return result;
}


export async function restoreBackup(input: unknown): Promise<BackupCounts | null> {
  const prisma = await getUserDb();

  if (!prisma) {
    return null;
  }

  const { file, rows, sourceVersion } = parseBackup(input);

  const counts = await prisma.$transaction(
    async (transaction) => {


      await transaction.$executeRaw`SELECT pg_advisory_xact_lock(${MONTH_ROLLOVER_LOCK_KEY})`;
      await transaction.$executeRaw`SELECT pg_advisory_xact_lock(${QUOTE_REFRESH_LOCK_KEY})`;
      await transaction.$executeRaw`SELECT pg_advisory_xact_lock(${DEFAULT_TARGETS_LOCK_KEY})`;


      for (const { key, shared } of [...BACKUP_TABLES].reverse()) {
        if (!shared) {
          await delegate(transaction, key).deleteMany();
        }
      }

      const prepared = await replaceTakenIds(transaction, rows);

      for (const { key, shared } of BACKUP_TABLES) {


        const data = shared
          ? prepared[key].map((row) => Object.fromEntries(Object.entries(row).filter(([field]) => field !== "id")))
          : prepared[key].map((row) => ({ ...row, userId: SCOPED_USER }));

        for (let start = 0; start < data.length; start += INSERT_CHUNK) {
          await delegate(transaction, key).createMany({
            data: data.slice(start, start + INSERT_CHUNK),
            ...(shared ? { skipDuplicates: true } : {}),
          });
        }
      }

      const counts = await currentCounts(transaction);
      const expected = countsOf(rows);
      const mismatch = BACKUP_TABLES.find(({ key, shared }) => !shared && counts[key] !== expected[key]);

      if (mismatch) {
        throw new Error(
          `Restoration saved ${counts[mismatch.key]} rows in ${mismatch.key}, while the backup contains ${expected[mismatch.key]}.`,
        );
      }

      await transaction.dataImport.create({
        data: { userId: SCOPED_USER, exportedAt: new Date(file.exportedAt), formatVersion: sourceVersion },
      });

      return { ...counts, dataImports: counts.dataImports + 1 };
    },
    { maxWait: 15_000, timeout: 120_000 },
  );


  // Insert a new record only when it is missing.
  if (counts.targetPlans === 0 && (await ensureDefaultTargetPlan().catch(() => null)) === "created") {
    return currentCounts(prisma as unknown as Transaction);
  }

  return counts;
}
