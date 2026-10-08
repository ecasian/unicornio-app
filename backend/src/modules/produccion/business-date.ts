export const DEFAULT_BUSINESS_TIMEZONE = 'America/Mexico_City';

export type BusinessDateWindow = {
  fecha: string;
  timezone: string;
  start: Date;
  end: Date;
};

function dateParts(date: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return {
    year: Number(values.year), month: Number(values.month), day: Number(values.day),
    hour: Number(values.hour), minute: Number(values.minute), second: Number(values.second),
  };
}

function validateDate(fecha: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(fecha);
  if (!match) throw new Error('fecha debe usar el formato YYYY-MM-DD');
  const [, yearText, monthText, dayText] = match;
  const year = Number(yearText), month = Number(monthText), day = Number(dayText);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() + 1 !== month || date.getUTCDate() !== day) {
    throw new Error('fecha no es un día calendario válido');
  }
}

function localMidnightUtc(fecha: string, timezone: string): Date {
  validateDate(fecha);
  const [year, month, day] = fecha.split('-').map(Number);
  const target = Date.UTC(year, month - 1, day);
  let guess = target;
  for (let attempt = 0; attempt < 6; attempt++) {
    const parts = dateParts(new Date(guess), timezone);
    const observed = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
    const delta = observed - target;
    if (delta === 0) return new Date(guess);
    guess -= delta;
  }
  throw new Error(`No se pudo resolver la medianoche de ${fecha} en ${timezone}`);
}

function localDate(date: Date, timezone: string) {
  const { year, month, day } = dateParts(date, timezone);
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function yesterdayLocal(now: Date, timezone: string) {
  const [year, month, day] = localDate(now, timezone).split('-').map(Number);
  const yesterday = new Date(Date.UTC(year, month - 1, day - 1));
  return `${String(yesterday.getUTCFullYear()).padStart(4, '0')}-${String(yesterday.getUTCMonth() + 1).padStart(2, '0')}-${String(yesterday.getUTCDate()).padStart(2, '0')}`;
}

export function resolveBusinessDate(fecha: string | undefined, timezone: string, now = new Date()): BusinessDateWindow {
  // Validate the timezone early and consistently, including when fecha is provided.
  dateParts(now, timezone);
  const resolved = fecha ?? yesterdayLocal(now, timezone);
  const start = localMidnightUtc(resolved, timezone);
  const [year, month, day] = resolved.split('-').map(Number);
  const next = new Date(Date.UTC(year, month - 1, day + 1));
  const nextDate = `${String(next.getUTCFullYear()).padStart(4, '0')}-${String(next.getUTCMonth() + 1).padStart(2, '0')}-${String(next.getUTCDate()).padStart(2, '0')}`;
  const end = localMidnightUtc(nextDate, timezone);
  return { fecha: resolved, timezone, start, end };
}
