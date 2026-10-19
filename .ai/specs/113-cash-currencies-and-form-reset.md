# 113 — Cash currencies and position form reset

Victor requested these changes on 2026-10-19; publish to dev/Preview only.

- Switching Asset/Cash, market or cash currency resets the dependent form fields,
  including ticker, quantity, execution price, fee, side, name, date, maturity,
  liquidity and validation state. Invalidate previous ticker proofs and pending
  responses. Choosing the same active option does not discard input.
- Use flex gaps in Details so Fund information and Settlement remain separate.
- Offer BRL Cash / BRL Balance, USD Cash / USD Balance and EUR Cash / EUR Balance.
  Cash requests only name and native balance, with a savings-account example.
  Hide maturity, redundant currency, trade controls and liquidity setup.
- Add eur-balance without rewriting existing keys or migrations. Use EUR FIAT
  observations and the existing BRL valuation / USD reporting pipeline. Fetch a
  missing monthly FX reference before opening the write transaction. Server-side
  cash classification is Cash, with no automatic accrual enabled by the form.
- Existing financial history and backup v5 stay compatible. Separate names can
  represent multiple cash holdings in the same currency.

Verification: 99 existing unit tests passed. Isolated integration saved balances
in all three currencies, checked native units and BRL values, no maturity/accrual,
Cash allocation, EUR backup/restore and Overview. Browser checks cover market and
currency resets, simplified Cash form, Details spacing and narrow-screen layout.
