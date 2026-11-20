export function shopDay(timeZone: string, date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(date);
  return ['year', 'month', 'day'].map(type => parts.find(part => part.type === type)?.value).join('-');
}

export function shiftDay(day: string, offset: number) {
  const date = new Date(day + 'T12:00:00Z');
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
}

export function displayDay(day: string, options: Intl.DateTimeFormatOptions = { dateStyle: 'medium' }) {
  return new Intl.DateTimeFormat('en-KE', { ...options, timeZone: 'UTC' }).format(new Date(day + 'T12:00:00Z'));
}

export function formatMoney(currency: string) {
  return new Intl.NumberFormat('en-KE', { style: 'currency', currency }).format;
}

export function timeOfDay(instant: string, timeZone: string) {
  return new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
    .format(new Date(instant));
}

export function formText(form: FormData, name: string) {
  return String(form.get(name) ?? '').trim();
}

export function nullableText(form: FormData, name: string) {
  return formText(form, name) || null;
}

export function nullableNumber(form: FormData, name: string) {
  const text = formText(form, name);
  return text === '' ? null : Number(text);
}

export function downloadCsv(filename: string, headers: string[], rows: (string | number | null | undefined)[][]) {
  function encode(value: string | number | null | undefined) {
    let text = String(value ?? '');
    // Neutralize spreadsheet formulas in free text such as customer names.
    if (typeof value === 'string' && /^[\s\uFEFF]*[=+\-@\t\r\n]/.test(text)) text = "'" + text;
    return '"' + text.replace(/"/g, '""') + '"';
  }

  const csv = [headers, ...rows].map(row => row.map(encode).join(',')).join('\r\n');
  const url = URL.createObjectURL(new Blob(['\uFEFF', csv], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.download = filename;
  link.href = url;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function errorMessage(error: unknown) {
  if (typeof error === 'object' && error !== null && 'message' in error && typeof error.message === 'string') {
    if (/failed to fetch|networkerror|load failed/i.test(error.message)) {
      return 'The connection was interrupted. Check your connection and retry.';
    }
    return error.message;
  }
  return 'The request could not be completed. Try again.';
}
