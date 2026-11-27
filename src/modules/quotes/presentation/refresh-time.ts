
/** Show relative update age within an hour and absolute browser-local time for older updates. */
const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;

const timeFormat = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit" });
const dayFormat = new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "2-digit" });
const fullFormat = new Intl.DateTimeFormat("en-GB", { dateStyle: "short", timeStyle: "short" });

export type RefreshTimeLabel = { long: string; short: string; absolute: string };


export function formatRefreshDateTime(iso: string) {
  return fullFormat.format(new Date(iso)).replace(", ", " at ");
}


export function describeRefreshTime(iso: string, now: number): RefreshTimeLabel {
  const date = new Date(iso);
  const elapsed = now - date.getTime();
  const absolute = formatRefreshDateTime(iso);

  if (elapsed < MINUTE) {
    return { long: "Updated just now", short: "just now", absolute };
  }

  if (elapsed < HOUR) {
    const minutes = Math.floor(elapsed / MINUTE);
    return { long: `Updated ${minutes} min ago`, short: `${minutes} min`, absolute };
  }

  const time = timeFormat.format(date);
  const today = new Date(now);
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);

  if (date.toDateString() === today.toDateString()) {
    return { long: `Updated at ${time}`, short: time, absolute };
  }

  if (date.toDateString() === yesterday.toDateString()) {
    return { long: `Updated yesterday at ${time}`, short: "yesterday", absolute };
  }

  const day = dayFormat.format(date);
  return { long: `Updated on ${day} at ${time}`, short: day, absolute };
}
