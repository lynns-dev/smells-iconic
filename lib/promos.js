// Automatic holiday sales: 20% off on every major US holiday, running from
// 7 days before the holiday through the day after (for late viewers). Kept
// in code rather than the admin's KV list (lib/discountsStore.js) because
// the dates are worked out each year, so sales switch on and off on their
// own. Checkout accepts the codes through pages/api/validate-discount.js
// and TopBanner advertises whichever sale is running.
//
// Days are counted in Pacific time, so a sale runs through the last day
// everywhere in the US. To add or drop a holiday, edit HOLIDAYS.

const PERCENT_OFF = 20;
const DAYS_BEFORE = 7;
const DAYS_AFTER = 1;
const TIME_ZONE = 'America/Los_Angeles';

// Day number (days since 1970-01-01) of a calendar date; month is 1-12.
function day(year, month, date) {
  return Date.UTC(year, month - 1, date) / 86400000;
}

// The nth given weekday (0 = Sunday) of a month; n = -1 means the last one.
function nthWeekday(year, month, weekday, n) {
  if (n === -1) {
    const last = new Date(Date.UTC(year, month, 0));
    return day(year, month, last.getUTCDate() - ((last.getUTCDay() - weekday + 7) % 7));
  }
  const first = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
  return day(year, month, 1 + ((weekday - first + 7) % 7) + (n - 1) * 7);
}

// Western Easter Sunday (anonymous Gregorian algorithm).
function easter(year) {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const date = ((h + l - 7 * m + 114) % 31) + 1;
  return day(year, month, date);
}

const HOLIDAYS = [
  { name: "New Year's", code: 'NEWYEAR20', date: (y) => day(y, 1, 1) },
  { name: "Valentine's Day", code: 'VALENTINE20', date: (y) => day(y, 2, 14) },
  { name: 'Easter', code: 'EASTER20', date: easter },
  { name: "Mother's Day", code: 'MOM20', date: (y) => nthWeekday(y, 5, 0, 2) },
  { name: 'Memorial Day', code: 'MEMORIAL20', date: (y) => nthWeekday(y, 5, 1, -1) },
  { name: "Father's Day", code: 'DAD20', date: (y) => nthWeekday(y, 6, 0, 3) },
  { name: '4th of July', code: 'JULY4TH20', date: (y) => day(y, 7, 4) },
  { name: 'Labor Day', code: 'LABORDAY20', date: (y) => nthWeekday(y, 9, 1, 1) },
  { name: 'Halloween', code: 'SPOOKY20', date: (y) => day(y, 10, 31) },
  // Thanksgiving; the day after covers Black Friday.
  { name: 'Black Friday', code: 'BLACKFRIDAY20', date: (y) => nthWeekday(y, 11, 4, 4) },
  { name: 'Christmas', code: 'XMAS20', date: (y) => day(y, 12, 25) },
];

function todayInPacific(now) {
  const [y, m, d] = new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE }).format(now).split('-').map(Number);
  return day(y, m, d);
}

// Every sale running on `now`, soonest holiday first. Neighbouring windows
// can overlap (Christmas and New Year's), so more than one can be live.
export function activePromos(now = Date.now()) {
  const today = todayInPacific(now);
  const year = new Date(today * 86400000).getUTCFullYear();
  const live = [];
  for (const y of [year - 1, year, year + 1]) {
    for (const h of HOLIDAYS) {
      const holiday = h.date(y);
      if (today >= holiday - DAYS_BEFORE && today <= holiday + DAYS_AFTER) {
        live.push({
          code: h.code,
          type: 'percent',
          value: PERCENT_OFF,
          holiday,
          banner: `${h.name} Sale — ${PERCENT_OFF}% off with code ${h.code}`,
        });
      }
    }
  }
  // A holiday still ahead (or today) beats one that has just passed.
  return live.sort((a, b) => (a.holiday < today) - (b.holiday < today) || a.holiday - b.holiday);
}

export function activePromo(now = Date.now()) {
  return activePromos(now)[0] || null;
}

export function findPromo(code, now = Date.now()) {
  const wanted = (code || '').trim().toLowerCase();
  return activePromos(now).find((p) => p.code.toLowerCase() === wanted) || null;
}
