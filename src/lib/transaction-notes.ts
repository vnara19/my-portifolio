/** Recognize generated accrual markers in both current and legacy backups. */
export function isAutomaticAccrualNote(note: string | null | undefined): boolean {
  return Boolean(note && /^(?:Automatic accrual|Rendimento automático)/.test(note));
}

/** Translate generated legacy notes without changing free-form user notes. */
export function englishTransactionNote(note: string): string {
  return note
    .replace(/^Rendimento automático(?: até)?/, "Automatic accrual through")
    .replace(/^Liquidação/, "Liquidation")
    .replace(/: recebido abaixo do saldo$/, ": received less than the balance");
}
