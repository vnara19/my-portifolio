# Investment-only tracking

Purchases are direct investment entries. No cash deposit, funding source, receivable or wallet is required. Fiat-only registration is rejected at the write boundary and absent from the form. Existing balances and backup history remain intact.

## Brazilian Fixed Income

The registration is restored to CDB, LCI and LCA, with issuer, purchase date, invested amount, CDI / fixed / IPCA terms and mandatory maturity after purchase. Redemption is fixed to At Maturity at the write boundary; daily-liquidity reserves belong in Savings. The contract balance uses the original gross accrual logic. Savings-specific net tracking and manual opening-balance modes are not part of this form.

Dated holdings exit active tracking at maturity. Reconciliation records one external withdrawal and zeroes later carried snapshots, without creating cash or a tax settlement. Historical pre-maturity holdings remain. Repeated visits are idempotent. Missing final rates are not invented bank receipts.

## Savings

New Savings registration supports BRL CDI and EUR Instant Access only, with dated deposits, withdrawals, prospective rate changes and bank-balance reconciliation. The source ledger is stored in the existing asset JSON; no database migration is required. Derived monthly snapshots and transactions are rebuilt under the per-user edit lock, preserving unchanged transaction identifiers. Backdated changes and removal support multi-month Undo. Removal archives the registration and preserves its source history; actual outflows use Withdraw Money instead.

- BRL CDI: known deposits retain their original principal and tax date. Public CDI accrues on Brazilian business days. The supplied bank-registration profile uses Brazilian-resident CDB withholding: IOF followed by regressive IR. A redemption identifies its original deposit when several lots are available; no FIFO order is assumed. This models the bank balance, not the user's worldwide tax obligations.
- Existing BRL net balance without old deposit history: manual balance updates, with no invented original principal or tax age. Future movements are dated, but the unknown opening balance cannot become an exact automatic tax calculation.
- Ireland Instant Access Savings: EUR only, with a non-editable account summary instead of product, opening-type, rate-quotation and tax selectors. Existing balance/date is used as its starting point and accrues automatically. Server-side registration pins the confirmed AER/tier/tax conditions; rate edits are rejected for Instant Access. Daily calculation retains separate cent carry for paid gross interest and DIRT. The user confirmed 2.5% AER up to EUR 2,500, 1% AER on excess and 33% DIRT. Converting a rounded AER cannot guarantee bank-cent equality; the exact nominal rate is in Deposit Information.
- Flexible Cash Funds and USD Savings: no new registration. Historical JSON remains readable for backup compatibility; it is not silently converted into a different product.

Bank reconciliation is investment income/correction rather than a new contribution. A confirmed zero can close a rounding remainder; it does not erase remaining acquisition cost. Automatic calculations use recorded rates and available public reference data, not an authenticated bank feed.

## Performance and presentation

Withdrawals and maturity exits are capital outflows, not investment losses. A later acquisition is acquisition cost, not profit. Capitalized Savings income increases units without adding acquisition cost; closed holding gains remain in the USD gain ledger. Ordinary movements require their dated FX. The existing portfolio-value chart shows tracked balances and identifies itself as a balance chart, not a time-weighted return chart.

Registration shows a compact identified-asset summary (name, product and exposure class), without repeating listing market or instrument type. Official GPCA11 issuer metadata identifies it as a fixed-income ETF even when provider metadata labels it EQUITY. Savings display native currency consistently. Generic transaction editing is locked for derived Savings entries; source changes belong in its dedicated panel. Generated ETF prefixes and redundant subtitles remain display-only normalization, without renaming stored assets.

## Validation and sources

Unit tests cover marginal tiers, AER conversion, leap-year nominal interest, cent carry, final net APY without double taxation, prospective rate changes, CDI tax lots, missing history, withdrawals, reconciliation and residual closure. Isolated integration tests cover BRL/EUR and reject new USD registration, backdated changes, Undo, idempotency, removal/restore, backup/restore, mandatory maturity, cash rejection and maturity exits.

- [Revolut Ireland Instant Access interest](https://help.revolut.com/en-IE/help/app-features/savings-vaults/earning-interest-with-instant-access-savings/)
- [Revolut savings terms](https://www.revolut.com/en-IE/legal/savings-account/)
- [Revolut Flexible Cash Funds](https://www.revolut.com/en-IE/flexible-cash-funds/)
- [Itaú Cofrinhos](https://www.itau.com.br/cofrinhos)
- [Receita Federal, IN 1585 article 46](https://normas.receita.fazenda.gov.br/sijut2consulta/link.action?idAto=67494)
- [Decree 6306, IOF annex](https://www2.camara.leg.br/legin/fed/decret/2007/decreto-6306-14-dezembro-2007-566561-normaatualizada-pe.html)
