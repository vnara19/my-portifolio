/** Saves and reloads a historical bond in the disposable integration schema only. */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { databaseSchema, getPrismaClient } from '@/lib/prisma';
import { runAsUser } from '@/lib/user-db';
import { addPosition } from '@/modules/portfolio/application/month-editing';
import { currentReferenceMonth } from '@/modules/quotes/domain/calendar';
import { internationalBondSchema } from '@/modules/portfolio/domain/international-bond';
async function main() {
 assert.match(databaseSchema(process.env.DATABASE_URL ?? '') ?? '', /^english099_[a-f0-9]+$/);
 const db = getPrismaClient()!, id = randomUUID(), original = globalThis.fetch;
 globalThis.fetch = async () => { throw new Error('Provider unavailable: saved daily FX must be reused.'); };
 try {
  await db.user.create({ data: { id, name: 'Bond save regression', email: `${id}@example.test` } });
  const institution = await db.institution.create({ data: { userId: id, name: 'Portfolio', normalizedName: 'portfolio' } });
  const account = await db.account.create({ data: { userId: id, institutionId: institution.id, name: 'Main' } });
  console.log('Isolated owner and account created.');
  const month = await db.portfolioMonth.create({ data: { userId: id, referenceDate: currentReferenceMonth(), status: 'DRAFT' } });
  const bond = internationalBondSchema.parse({ type: 'international-bond', identifier: 'US61690D6W39', issuer: 'Morgan Stanley', issuerCountry: 'United States', family: 'Corporate', currency: 'USD', structure: 'Fixed', maturityDate: '2030-06-20', faceAmount: '10000', faceValuePerBond: '1000', settlementDate: '2025-06-23', totalPaid: '9967.81', accruedInterestPaid: '70.70', fixedCoupon: { annualRate: '4.3', frequency: 2, anchorDate: '2026-12-18', dayCount: 'Manual' }, valuationMode: 'Cost', quotes: [] });
  await db.dailyQuote.createMany({data: ['2025-06-23', '2025-06-30'].map(day => ({symbol:'USD',quoteDate:new Date(day),instrumentType:'FIAT',baseCurrency:'USD',valueBrl:5,provider:'integration',fetchedAt:new Date()})),skipDuplicates:true});
  console.log('Saving exact historical purchase.');
  await runAsUser(id, () => addPosition({ monthId: month.id, addition: { accountId: account.id, newAsset: { name: 'Morgan Stanley', kind: 'international-bond', ticker: null, maturityDate: bond.maturityDate, quoteCheckToken: null, manualPriceBrl: null, bondContract: bond }, value: bond.faceAmount, allocations: [], strategy: null } }));
  const entry = await db.positionTransaction.findFirstOrThrow({ where: { userId: id, kind: 'CONTRIBUTION' } });
  assert.equal(entry.quantity.toString(), '10000'); assert.equal(entry.amountBrl.toString(), '49839.05');
  const current = await db.position.findFirstOrThrow({where:{userId:id,portfolioMonthId:month.id}});
  assert.equal(current.quantity.toString(), '10000'); assert.equal(current.totalBrl.toString(), '49839.05');
  console.log('Historical bond purchase saved and reloaded successfully in isolated schema.');
 } catch (error) { console.error('SAVE FAILURE', error); throw error; } finally { globalThis.fetch = original; await db.position.deleteMany({where:{userId:id}}); await db.asset.deleteMany({where:{userId:id}}); await db.account.deleteMany({where:{userId:id}}); await db.institution.deleteMany({where:{userId:id}}); await db.user.deleteMany({ where: { id } }); await db.$disconnect(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
