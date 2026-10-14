# Shared style guide

## Existing identity

Keep the dark theme and current investment layout. Compare equivalent controls
before introducing a component: default, hover, focus, selected, disabled, empty
and error states must remain consistent. Reuse `src/components/ui`,
`src/components/product`, shared finance primitives and `globals.css` tokens.
The legacy spreadsheet informs data and financial rules, not visual styling.

## Semantic colors

- Background: `background`; panels: `card`, `popover`, `metric-card`, `premium-panel`.
- Primary text: `foreground`; secondary and zero values: `muted-foreground` as appropriate.
- Main actions and positive investment movement: `primary`.
- Negative movement and destructive validation: `destructive`.
- Pending/attention states: `warning`; informational qualifiers: `accent`.
- Borders, inputs and focus indicators: `border`, `input`, `ring`.
- Charts: shared `chart-*` tokens and the color-blind-friendly Okabe-Ito category map.

Preserve category color identity when labels are translated. Never rely on color
alone: include signs, labels and accessible names. A withdrawal is not inherently
a loss. Tooltips use a series-color marker and readable neutral text.

## Shared controls

Use one `KpiCard`: label left, optional icon right, value, detail and optional footer.
Icons stay on the right; avoid colored glows or a new visual identity per screen.
Use shared badges, page controls, pickers, timelines and bottom sheets. Declare
atomic variants with `tailwind-variants` rather than duplicating classes.

Use Overview, Positions and Settings in the top navigation. No area sidebar or
family/payroll/pension navigation. Keep Quotes within Positions. Retain narrow-screen
behavior, horizontal overflow within bounded panels, and readable mobile metric cards.

## Accessibility and motion

Preserve keyboard navigation, visible focus, semantic labels, reduced motion and
browser zoom. Respect safe-area insets and small viewports. Calendar/month labels,
forms and validation must be English. Tap targets and mobile sheets must remain
usable. Chart touch tooltips disappear when touch ends; charts do not switch months.

## Language and contracts

Use consistent English financial labels: Fixed income, Equities, Cash, Contributions,
Withdrawals, Opening balance and Automatic accrual. Keep Tesouro Direto, Selic, CDI,
IPCA and tickers. English numeric/date display must not change BRL/USD semantics.
Keep database category keys separate from translated labels and free-form user names.
