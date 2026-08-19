/** Returns the last Monday of the given month (0-indexed). */
export function getLastMonday(year: number, month: number): Date {
  const last = new Date(year, month + 1, 0); // last day of month
  const dow = last.getDay(); // 0=Sun … 6=Sat
  const daysBack = dow === 1 ? 0 : dow === 0 ? 6 : dow - 1;
  return new Date(year, month, last.getDate() - daysBack);
}

function getLastBusinessDay(year: number, month: number): Date {
  const d = new Date(year, month + 1, 0);
  while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() - 1);
  return d;
}

function get25thOrPrev(year: number, month: number): Date {
  const d = new Date(year, month, 25);
  while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() - 1);
  return d;
}

function monthExpiry(symbol: string, year: number, month: number): Date {
  if (symbol === 'NATURALGAS' || symbol === 'NATGASMINI') return get25thOrPrev(year, month);
  if (['COPPER', 'ZINC', 'ALUMINIUM'].includes(symbol)) return getLastBusinessDay(year, month);
  return getLastMonday(year, month); // GOLD, SILVER, CRUDEOIL, etc.
}

/** Returns the next `count` expiry dates for the given MCX symbol. */
export function getUpcomingExpiries(symbol: string, count = 3): Date[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const result: Date[] = [];

  for (let offset = 0; result.length < count; offset++) {
    const ref = new Date(today.getFullYear(), today.getMonth() + offset, 1);
    const exp = monthExpiry(symbol, ref.getFullYear(), ref.getMonth());
    exp.setHours(0, 0, 0, 0);
    if (exp >= today) result.push(exp);
  }

  return result;
}

/** Calendar days from today (inclusive) to the expiry date. */
export function calculateDTE(expiry: Date): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const d = new Date(expiry);
  d.setHours(0, 0, 0, 0);
  return Math.max(0, Math.ceil((d.getTime() - today.getTime()) / 86_400_000));
}

/** Format as "26 May 2025". */
export function formatExpiry(d: Date): string {
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}
