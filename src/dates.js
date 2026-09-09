function fail(message) {
  throw new Error(message);
}

function formatterFor(timeZone) {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    });
  } catch {
    fail('タイムゾーンが不正です');
  }
}

function dateParts(formatter, value) {
  const entries = formatter.formatToParts(value)
    .filter((part) => part.type !== 'literal')
    .map((part) => [part.type, Number(part.value)]);
  return Object.fromEntries(entries);
}

function sameLocal(parts, wanted) {
  return parts.year === wanted.year
    && parts.month === wanted.month
    && parts.day === wanted.day
    && parts.hour === wanted.hour
    && parts.minute === wanted.minute;
}

function timeZoneOffsetAt(formatter, timestamp) {
  const rounded = Math.trunc(timestamp / 1000) * 1000;
  const parts = dateParts(formatter, new Date(rounded));
  const localAsUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  return localAsUtc - rounded;
}

function localToUtc(parts, timeZone) {
  const formatter = formatterFor(timeZone);
  const localAsUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute);
  const offsets = new Set();
  for (let hours = -36; hours <= 36; hours += 6) {
    offsets.add(timeZoneOffsetAt(formatter, localAsUtc + hours * 3_600_000));
  }
  const matches = [...offsets]
    .map((offset) => localAsUtc - offset)
    .filter((timestamp) => sameLocal(dateParts(formatter, new Date(timestamp)), parts))
    .sort((a, b) => a - b);
  if (matches.length === 0) fail('その日時は指定したタイムゾーンに存在しません');
  return new Date(matches[0]).toISOString();
}

function parseDateText(value) {
  if (typeof value !== 'string') fail('日付が不正です');
  let match;
  if ((match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value))
    || (match = /^(\d{4})\/(\d{2})\/(\d{2})$/.exec(value))
    || (match = /^(\d{4})(\d{2})(\d{2})$/.exec(value))) {
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const probe = new Date(Date.UTC(year, month - 1, day));
    if (probe.getUTCFullYear() === year && probe.getUTCMonth() === month - 1 && probe.getUTCDate() === day) {
      return { year, month, day };
    }
  }
  fail('日付が不正です');
}

function parseTimeText(value) {
  if (typeof value !== 'string') fail('時刻が不正です');
  const match = /^(\d{2}):(\d{2})$/.exec(value) || /^(\d{2})(\d{2})$/.exec(value);
  if (!match) fail('時刻が不正です');
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) fail('時刻が不正です');
  return { hour, minute };
}

function requireIso(value, label = '日時') {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(value)
    || !Number.isFinite(Date.parse(value))) {
    fail(`${label}が不正です`);
  }
  return value;
}

function localDisplayParts(iso) {
  const formatter = formatterFor(getTimeZone());
  return dateParts(formatter, new Date(requireIso(iso)));
}

function pad(number) {
  return String(number).padStart(2, '0');
}

export function getTimeZone() {
  try {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (typeof zone === 'string' && zone !== '') {
      formatterFor(zone);
      return zone;
    }
  } catch {
    // Fall through to the product default.
  }
  return 'Asia/Tokyo';
}

export function parseDeadline(dateText, timeText = '', timeZone = getTimeZone()) {
  if (typeof dateText !== 'string' || typeof timeText !== 'string') fail('期限が不正です');
  if (dateText === '') {
    if (timeText !== '') fail('日付を入力してください');
    return { dueAt: null, dueHasTime: false };
  }
  const date = parseDateText(dateText);
  const dueHasTime = timeText !== '';
  const time = dueHasTime ? parseTimeText(timeText) : { hour: 9, minute: 0 };
  return { dueAt: localToUtc({ ...date, ...time }, timeZone), dueHasTime };
}

export function formatDateTime(iso, { dateOnly = false } = {}) {
  if (iso === null || iso === undefined || iso === '') return '期限なし';
  const parts = localDisplayParts(iso);
  const date = `${parts.year}/${pad(parts.month)}/${pad(parts.day)}`;
  return dateOnly ? date : `${date} ${pad(parts.hour)}:${pad(parts.minute)}`;
}

export function deadlineFields(iso, dueHasTime = true) {
  if (iso === null || iso === undefined || iso === '') return { date: '', time: '' };
  if (typeof dueHasTime !== 'boolean') fail('期限の時刻指定が不正です');
  const parts = localDisplayParts(iso);
  return {
    date: `${parts.year}-${pad(parts.month)}-${pad(parts.day)}`,
    time: dueHasTime ? `${pad(parts.hour)}:${pad(parts.minute)}` : '',
  };
}

export function isOverdue(dueAt, now = new Date().toISOString()) {
  if (dueAt === null) return false;
  requireIso(dueAt, '期限');
  requireIso(now, '現在日時');
  return Date.parse(dueAt) < Date.parse(now);
}
