let pendingChanges = 0;

export function setPendingChanges(count: number) {
  pendingChanges = count;
}

export function hasPendingChanges() {
  return pendingChanges > 0;
}

export function confirmDiscardChanges() {
  if (pendingChanges === 0) {
    return true;
  }

  return window.confirm(
    `There are ${pendingChanges} ${pendingChanges === 1 ? "unsaved change" : "unsaved changes"}. Leave and discard them?`,
  );
}
