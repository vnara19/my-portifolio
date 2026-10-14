import "dotenv/config";

import { getPrismaClient } from "../src/lib/prisma";
import { describeQuoteSync, isQuoteSyncFailure } from "../src/modules/quotes/application/quote-sync-report";
import { syncQuotes } from "../src/modules/quotes/application/sync-quotes";


//
//   pnpm quotes:sync
//


async function main() {
  const outcome = await syncQuotes();

  for (const line of describeQuoteSync(outcome)) {
    console.log(line);
  }

  await getPrismaClient()?.$disconnect();
  process.exitCode = isQuoteSyncFailure(outcome) ? 1 : 0;
}

main().catch(async (error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  await getPrismaClient()?.$disconnect();
  process.exitCode = 1;
});
