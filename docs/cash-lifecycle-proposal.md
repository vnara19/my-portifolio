# Cash and maturity lifecycle proposal

Status: superseded by the user on 2026-10-26. See [investment-only tracking](investment-lifecycle.md). The wallet, funding choice and receivable proposal below is no longer the requested behavior.

## Confirmed preferences

- Show USD first in portfolio totals, followed by BRL and EUR.
- Allow a purchase funded by New Contribution without an earlier cash deposit, or by Use Cash with a same-currency debit. Internal transfers must not count as new contributions.
- Separate available cash from invested holdings while including both exactly once in portfolio value.
- At maturity, preserve investment history and move the entitlement into receivables until the actual net credit is confirmed. A receivable is not spendable cash.
- Show an optional net-payment forecast separately from confirmed balances. Brazilian tax assumptions are for an individual tax resident in Brazil; do not apply these rules to foreign bonds.
- Distinguish Pay to Cash from Renew / Keep Invested explicitly. Do not infer renewal from the asset name, CDI indexer or the word Caixinha. A renewal may change the rate, maturity and tax lot.
- Credit the matching currency only once on confirmed settlement. Contractual maturity and the institution's payment day can differ.

## Current behavior and safeguards

Removing a record affects only the selected reporting month and supports Undo. It does not represent a sale or redemption. Linked cash movements now block record deletion until their transactions are removed, preventing an orphan counterpart. Current liquidation closes the source holding but does not credit a separate cash wallet.

The isolated removal integration check covers month ownership, cascade deletion, preservation of other months, Undo and linked-movement protection.

## Sources for implementation

- [Receita Federal: fixed-income tax rules, article 46](https://normas.receita.fazenda.gov.br/sijut2consulta/link.action?idAto=67494): holding-period income-tax brackets and taxable return after applicable IOF. Forecasting also needs exact acquisition lots, payments, fees and applicable exemptions.
- [Receita Federal: capital income](https://www.gov.br/receitafederal/pt-br/assuntos/meu-imposto-de-renda/preenchimento/manual-mir/rendimentos/rendimentos-do-capital): LCI and LCA exemptions for individuals.
- [Tesouro Direto rules](https://www.tesourodireto.com.br/sobre-o-tesouro/regras-e-regulamento): maturity payments, institution timing and charges.
- [B3: programmed Treasury reinvestment](https://borainvestir.b3.com.br/tipos-de-investimentos/renda-fixa/tesouro-direto/seu-titulo-esta-para-vencer-saiba-como-programar-o-reinvestimento-automatico/): reinvestment is an elected instruction, not an inherent property of Tesouro Selic.

Before enabling automatic settlement, cover idempotency, tax lots, business-day settlement, partial payments, reversals, historical carry-forward and paired-transfer Undo with isolated integration tests. Never turn a projected net amount into confirmed available cash.
