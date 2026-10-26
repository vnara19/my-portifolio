# Investment-only tracking

The user replaced the cash-wallet proposal on 2026-10-26. Purchases remain direct investment entries: no cash deposit, funding-source selection, receivable or wallet is required. New BRL/USD/EUR cash-only holdings are rejected at the write boundary and absent from the form. Existing balances and backup history are preserved.

## Reserves and maturity

Brazilian CDB/LCI/LCA maturity is optional. No maturity means the recorded investment remains active until a withdrawal; this is a tracking choice, not a claim that the bank's underlying deposits never expire. Dated holdings exit tracking at maturity. Navigation processes due holdings under the existing per-user edit lock, records one external withdrawal at their recorded value and zeroes later carried snapshots. It creates neither a cash asset nor a bank payment. Historical pre-maturity holdings remain. The exit is not a forecast of the actual net bank credit; unavailable final rates do not become invented receipts.

Closed rows are absent from active Positions but remain available through historical months and asset history. Each visit reconciles matured exposure, so an unattended app does not need a financial transaction job to update its next rendered view.

The asset detail's Add / Withdraw action records partial redemptions without rewriting the opening purchase. Dated transaction changes carry forward with multi-month Undo. Withdrawals above the balance on their date, movements before the deposit and new movements at/after maturity are rejected.

## Net Brazilian deposits

Tracking offers Automatic Gross Balance, New Deposit · Net of Brazilian Taxes and Existing Net Balance · Manual Updates. The last option stores the supplied balance without inventing missing original deposits or automatic returns.

NET_BR is an optional contract field, preserving old JSON/backup semantics. It models one known deposit per position for a Brazilian individual tax resident. Each new net deposit must be recorded separately to preserve its original tax date. CDB net valuation deducts IOF on short holding periods, then regressive IR on the remaining taxable profit. LCI/LCA use the individual exemptions. Gross balance remains in quantity for accrual; totalBrl is the calculated net valuation. No tax is paid by this application. Bank-specific rounding and an incomplete initial ledger preclude a guarantee that the result exactly matches an account statement.

A net withdrawal records the supplied net amount in a structured note, removes the corresponding gross balance and proportional original principal, and retains the tax date of the remaining deposit. Net receipts, rather than gross removal, feed gain/history presentation. Repeated new deposits cannot silently reuse an earlier NET_BR tax date. Generic liquidation is disabled for these holdings; Add / Withdraw supports full redemptions as well.

- [Itaú Cofrinhos](https://www.itau.com.br/cofrinhos): underlying CDB, business-day accrual, gross versus net display, five-year deposit maturity and automatic redemption to the bank account. The goal date is different from deposit maturity.
- [Receita Federal, IN 1585 article 46](https://normas.receita.fazenda.gov.br/sijut2consulta/link.action?idAto=67494): IR brackets and base after applicable IOF.
- [Decree 6306, annex](https://www2.camara.leg.br/legin/fed/decret/2007/decreto-6306-14-dezembro-2007-566561-normaatualizada-pe.html): IOF holding-period table.

## Returns and presentation

A withdrawal or maturity exit is a capital outflow. A subsequent acquisition increases acquisition cost; it is not profit, regardless of whether the user reused withdrawn money. The existing USD gain ledger retains closed holdings. The portfolio-value chart still shows actual tracked balances and explicitly identifies itself as a balance chart, not a time-weighted performance chart. Missing cost/FX continues to make return metrics unavailable rather than estimated.

Generated ETF prefixes are removed at display time, without renaming stored assets. A ticker identical to the displayed name is not repeated in the subtitle. A product name identical to the title is not repeated either.

Validation includes tax/IOF boundaries and exemptions, unchanged-name display, a maturity/reinvestment gain case, plus isolated integration checks for actual CDI net valuation, partial/full withdrawals, Undo, repeated maturity processing, ongoing undated reserves and rejection of cash creation.
