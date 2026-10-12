// The system's date arithmetic, as Clock Adjustment's date check uses it (HDD OSD 1.10U; ROM 2.30
// has the same functions word for word at the addresses in brackets):
//
//   func_002149D8 (0x0020E3A8)         a date to seconds since 1600-01-01
//   some_sort_of_lut_calc (0x0020E570)  seconds back to a date
//   func_00214728 (0x0020E0F8)          a time moved by the console's time zone and summer time
//   func_002357D0 (0x00231C78)          the days of a month
//   func_00227488 (0x00222BF0)          the date check after a field of Clock Adjustment changed
//
// Integers only. Seconds are 64-bit in the code; JavaScript BigInt here.

// D_00360E40: days per month, common and leap years.
const MONTHS = [[31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31], [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]];
/** func_00214988: a leap year. */
const leap = (y) => (y % 400 === 0 ? 1 : y % 100 === 0 ? 0 : (y & 3) === 0 ? 1 : 0);
const div = (a, b) => a / b;                 // BigInt division truncates, as __divdi3 does
const mod = (a, b) => a % b;

/** func_002149D8(year, month, day, hour, minute, second). */
export function secondsOf(y, mo, d, h, mi, s) {
  const years = y - 1600;
  let days = d - 1;
  const row = MONTHS[leap(years)];
  for (let i = 0; i < mo - 1; i++) days += row[i];
  const fours = (years + 3 > -1 ? years + 3 : years + 6) >> 2;
  days += 365 * years + fours - Math.trunc((years + 99) / 100) + Math.trunc((years + 399) / 400);
  return ((BigInt(days) * 24n + BigInt(h)) * 60n + BigInt(mi)) * 60n + BigInt(s);
}

/** some_sort_of_lut_calc(seconds): [year, month, day, hour, minute, second]. */
export function dateOf(seconds) {
  let t = seconds;
  const s = Number(mod(t, 60n)); t = div(t, 60n);
  const mi = Number(mod(t, 60n)); t = div(t, 60n);
  const h = Number(mod(t, 24n)); t = div(t, 24n);
  let y = 1600;
  if (t > 0x23ab0n) { t -= 0x23ab1n; y += Number(div(t, 0x23ab1n) + 1n) * 400; t = mod(t, 0x23ab1n); }
  let short = 0;
  if (!(t < 0x8eadn)) { t -= 0x8eadn; y += Number(div(t, 0x8eacn) + 1n) * 100; t = mod(t, 0x8eacn); short = 1; }
  const four = BigInt(0x5b5 - short);
  if (t < four) short ^= 1;
  else { t -= four; y += Number(div(t, 0x5b5n) + 1n) * 4; t = mod(t, 0x5b5n); short = 1; }
  const first = BigInt(short + 0x16d);
  if (!(t < first)) { t -= first; y += 1 + Number(div(t, 0x16dn)); t = mod(t, 0x16dn); }
  const row = MONTHS[leap(y)];
  let m = 0;
  while (!(t < BigInt(row[m]))) { t -= BigInt(row[m]); m += 1; }
  return [y, m + 1, Number(t) + 1, h, mi, s];
}

/** The base zone's offset, minutes: city 0x33 (get_timezone_info_struct). */
export const BASE_ZONE = 540;

/** config_get_timezone_offset and config_get_daylight_saving: the zone's minutes (bits 9..19, signed) and summer time (bit 29). */
export const zoneOf = (param) => (param << 12) >> 21;
export const summerOf = (param) => (param >>> 29) & 1;

/** func_00214728(seconds): moved by the configured zone (minutes) from the base zone 540, and an hour of summer time. */
export function zoned(seconds, param) {
  const offset = zoneOf(param), summer = summerOf(param);
  const t = seconds - BigInt(BASE_ZONE) * 60n + BigInt(offset) * 60n;
  return summer ? t + 3600n : t;
}

/** func_002357D0(year, month). */
export const daysIn = (y, mo) => (mo === 2 ? (y % 400 === 0 ? 29 : y % 100 === 0 ? 28 : (y & 3) === 0 ? 29 : 28) : MONTHS[0][mo - 1]);

/**
 * func_00227488: keep the six date items within 2000-01-01 00:00:00 and 2099-12-31 23:59:59 as
 * seen in the configured zone, and the day within its month; write each field's range into the
 * fields table. `items` are [year, month, day, hour, minute, second]; returns them corrected and
 * the ranges by item, [lowest, highest] for items 6 to 0xB.
 */
export function dateCheck(items, param) {
  const lo = dateOf(zoned(0x2f0605980n, param)), hi = dateOf(zoned(0x3ac796cffn, param));
  const [y, mo, d, h, mi] = items;
  const later = lo[0] < y, earlier = y < hi[0];
  const minMonth = later ? 1 : lo[1], maxMonth = earlier ? 12 : hi[1];
  const minDay = later || minMonth < mo ? 1 : lo[2];
  let maxDay = earlier || mo < maxMonth ? 31 : hi[2];
  const minHour = later || minMonth < mo || minDay < d ? 0 : lo[3];
  const maxHour = earlier || mo < maxMonth || d < maxDay ? 23 : hi[3];
  const minMinute = later || minMonth < mo || minDay < d || minHour < h ? 0 : lo[4];
  const maxMinute = earlier || mo < maxMonth || d < maxDay || h < maxHour ? 59 : hi[4];
  let out = [...items];
  const t = secondsOf(...items);
  const low = zoned(0x2f0605980n, param), high = zoned(0x3ac796cffn, param);
  if (t < low) out = dateOf(low);
  if (high < (t < low ? low : t)) out = dateOf(high);
  const dim = daysIn(out[0], out[1]);
  if (dim < maxDay) maxDay = dim;
  if (maxDay < out[2]) out[2] = maxDay;
  return { items: out, ranges: [[lo[0], hi[0]], [minMonth, maxMonth], [minDay, maxDay], [minHour, maxHour], [minMinute, maxMinute], [0, 59]] };
}

/**
 * func_00214788 (ROM 0x0020E158): a local time in seconds back to the base zone's, the inverse of
 * func_00214728: minus an hour of summer time, minus the zone's minutes, plus the base zone's.
 */
export function unzoned(seconds, param) {
  const offset = zoneOf(param), summer = summerOf(param);
  return (summer ? seconds - 3600n : seconds) - BigInt(offset) * 60n + BigInt(BASE_ZONE) * 60n;
}

/**
 * func_002148B8 (ROM 0x0020E1B8), as config_item_change_cb_clock_write_mechacon calls it: the six
 * configuration items 6 to 0xB (year, month, day, hour, minute, second) as local time to the six
 * RTC words. A negative year or hour leaves the items as they are (the two bltz at the top).
 */
export function rtcFromLocal(items, param) {
  const [y, mo, d, h, mi, s] = items;
  if (h < 0 || y < 0) return [...items];
  return dateOf(unzoned(secondsOf(y, mo, d, h, mi, s), param));
}

/** func_00235138 (ROM 0x00231700): a value below 100 as packed decimal digits, one byte. */
export const bcd = (value) => (((Math.trunc(value / 10) << 4) + (value % 10)) & 0xff);
