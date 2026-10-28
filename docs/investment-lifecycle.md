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

## Asset detail currency and returns

Asset detail uses a presentation-only native-currency history: USD for the supported cryptocurrency purchase flow, otherwise the registered BRL/USD/EUR asset currency. Monthly snapshots and dated transactions are converted before replaying average acquisition cost and realized gains. Recorded execution FX takes precedence, then a dated public observation (up to seven days old); a legacy monthly fallback is explicitly approximate. Missing FX makes the affected native view unavailable rather than relabelling BRL or using today's rate. Raw BRL editing/write payloads remain separate and unchanged.

The detail currency provider applies consistently to metrics, chart axes/tooltips, month rows and transactions. The quote chart has one asset currency and retains its period controls and converted purchase markers. Native monthly return excludes recorded capital movements; its percentage uses Modified Dietz dated capital weights. The value-over-time graph remains a balance chart, so purchases increase the balance without being represented as investment return. Monthly balance attribution retains its separate flow bars. Gaps and missing observations do not acquire an invented exact return.


### Detail actions and historical corrections

Position details retain Remove for deleting an erroneous reporting-month record.
Purchases and sales are entered from Positions; detail headers no longer repeat
Liquidate, Add / Withdraw or Edit Position. Savings movements are opened from the
expanded Savings row in Positions and load the current owned ledger independently
of the reporting month being viewed.

Transactions offers All Transactions and the selected reporting month. Selecting a
month filters the view; it does not restrict correction of manually recorded
transactions in other months. Corrections use the transaction's own position and
month identifiers, retain server-side ownership checks and carry quantity changes
through later months with multi-month Undo. Generated Savings/accrual entries and
bond-derived records retain their product-specific protections.

Quoted purchase/sale corrections show quantity, native execution price, commission
and recorded BRL exchange rate. Totals and stored BRL basis are calculated on the
server using decimal arithmetic; fees are not mistaken for a quantity/price
mismatch. A historical reference conversion is editable when an actual execution
rate is available. Dates remain within the transaction's owning reporting month;
changing a transaction to a different month requires re-entering it in that month.
No new dividend/coupon entry option is exposed. Existing income history is retained;
unrecorded cash distributions are excluded from the displayed total return.


### Detail chart simplification

The detail header does not duplicate the Position Value KPI. Sources of Change and
its cumulative waterfall summary calculations have been removed. Monthly steps,
dated capital flows, cost replay and return calculations remain shared by the
remaining charts, Month By Month and Transactions. Existing recorded income is
preserved; no new dividend/coupon entry option is added.

Portfolio Weight compares against the preceding reporting month using its actual
percentage (for example, Up from 15.1% in Sept/26), avoiding a misleading percent
label for a percentage-point difference. On the price chart, the dashed average
purchase-price line is purple; purchase dots remain blue and withdrawal dots
remain orange, with the existing legend entries unchanged.
