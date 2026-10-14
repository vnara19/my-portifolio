
/** Represent monetary amounts as integer cents and persist decimal strings, avoiding floating-point rounding in sums. */


export type Cents = number;


export const MAX_AMOUNT_CENTS: Cents = 999_999_999;


export function parseAmountInput(text: string): Cents | null {
  const compact = text.replace(/R\$/gi, "").replace(/\s/g, "");

  if (compact === "") {
    return null;
  }

  let integer: string;
  let fraction = "";

  if (/^\d{1,3}(\.\d{3})*(,\d{1,2})?$/.test(compact) || /^\d+(,\d{1,2})?$/.test(compact)) {
    const [whole, decimals = ""] = compact.split(",");
    integer = whole.replace(/\./g, "");
    fraction = decimals;
  } else if (/^\d+\.\d{1,2}$/.test(compact)) {
    [integer, fraction] = compact.split(".");
  } else {
    return null;
  }

  const cents = Number(integer) * 100 + Number(fraction.padEnd(2, "0"));
  return Number.isSafeInteger(cents) ? cents : null;
}


export function decimalToCents(value: { toString(): string } | string): Cents {
  const text = value.toString().trim();
  const match = /^(-)?(\d+)(?:\.(\d+))?$/.exec(text);

  if (!match) {
    throw new Error(`Invalid decimal value: ${text}`);
  }

  const fraction = (match[3] ?? "").padEnd(2, "0");

  if (/[1-9]/.test(fraction.slice(2))) {
    throw new Error(`Value has more than two decimal places: ${text}`);
  }

  const cents = Number(match[2]) * 100 + Number(fraction.slice(0, 2));
  return match[1] ? -cents : cents;
}


export function centsToDecimal(cents: Cents) {
  const sign = cents < 0 ? "-" : "";
  const absolute = Math.abs(cents);
  return `${sign}${Math.trunc(absolute / 100)}.${String(absolute % 100).padStart(2, "0")}`;
}

const brl = new Intl.NumberFormat("en-GB", { style: "currency", currency: "BRL" });


export function formatCents(cents: Cents, { signed = false }: { signed?: boolean } = {}) {
  const text = brl.format(Math.abs(cents) / 100);

  if (cents < 0) {
    return `−${text}`;
  }

  return signed && cents > 0 ? `+${text}` : text;
}


export function formatAmountInput(cents: Cents) {
  return (cents / 100).toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
