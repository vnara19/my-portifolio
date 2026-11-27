/** Remember the inspected run, without changing its recorded success or failure. */
const KEY = "quotes:inspected-run";
const EVENT = "quotes:issue-read";
let inspected: string | null = null;

export function readInspectedQuoteRun() {
  if (typeof window === "undefined") return null;
  try { return window.localStorage.getItem(KEY) ?? inspected; } catch { return inspected; }
}

export function inspectQuoteRun(runId: string) {
  if (readInspectedQuoteRun() === runId) return;
  inspected = runId;
  try { window.localStorage.setItem(KEY, runId); } catch { /* In-memory acknowledgement still works. */ }
  window.dispatchEvent(new Event(EVENT));
}

export function subscribeInspectedQuoteRun(listener: () => void) {
  window.addEventListener(EVENT, listener);
  window.addEventListener("storage", listener);
  return () => {
    window.removeEventListener(EVENT, listener);
    window.removeEventListener("storage", listener);
  };
}

export function serverInspectedQuoteRun() { return null; }

export function hasUnreadQuoteIssue(hasIssues: boolean, runId: string | null, inspectedId: string | null, onQuotesPage: boolean) {
  return hasIssues && runId !== null && runId !== inspectedId && !onQuotesPage;
}
