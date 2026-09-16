import { uid, sanitizePlainText, todayISO } from './utils.js';

function hoursBetween(start, end) {
  if (!start || !end) return 0;
  const [sh, sm] = String(start).split(':').map(Number);
  const [eh, em] = String(end).split(':').map(Number);
  if (![sh, sm, eh, em].every(Number.isFinite)) return 0;
  const mins = (eh * 60 + em) - (sh * 60 + sm);
  return Math.max(0, Math.round((mins / 60) * 100) / 100);
}

export function workedHours(att, now = new Date()) {
  if (!att?.checkInTime) return 0;
  const end = att.checkOutTime || now.toTimeString().slice(0, 5);
  return hoursBetween(att.checkInTime, end);
}

export function jakartaNowParts(now = new Date()) {
  const fmt = new Intl.DateTimeFormat('id-ID', {
    timeZone: 'Asia/Jakarta',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
  const parts = Object.fromEntries(fmt.formatToParts(now).map(p => [p.type, p.value]));
  return {
    time: `${parts.hour}:${parts.minute}`,
    hour: Number(parts.hour),
    longDate: [parts.weekday, parts.day, parts.month, parts.year]
      .filter(Boolean)
      .map((part, i) => (i === 0 ? part.charAt(0).toUpperCase() + part.slice(1) : part))
      .reduce((acc, part, i) => (i === 0 ? part : i === 1 ? `${acc}, ${part}` : `${acc} ${part}`), ''),
  };
}

export function currentMonthKey(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit' }).format(now);
}

export { hoursBetween };
export { uid, sanitizePlainText, todayISO };
