/**
 * String format detection. A format is only pinned when EVERY observed
 * value at a path matches the same detector, so the detectors err on
 * the strict side: a false "uuid" on one value would pin a constraint
 * the API never promised.
 */
import type { StringFormat } from "./types.js";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// RFC 3339 date-time: full date, "T" (or lowercase t), full time with
// optional fractional seconds, and a mandatory offset ("Z" or ±hh:mm).
const DATE_TIME_RE =
  /^(\d{4})-(\d{2})-(\d{2})[Tt](\d{2}):(\d{2}):(\d{2})(?:\.\d{1,9})?(?:[Zz]|[+-]\d{2}:\d{2})$/;

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

// Deliberately conservative: one @, a dotted domain, no spaces.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@.]{2,}$/;

const DAYS_IN_MONTH = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

function plausibleDate(y: number, m: number, d: number): boolean {
  if (m < 1 || m > 12 || d < 1) return false;
  const cap = DAYS_IN_MONTH[m - 1] as number;
  return d <= cap;
}

export function isUuid(s: string): boolean {
  return UUID_RE.test(s);
}

export function isIsoDateTime(s: string): boolean {
  const m = DATE_TIME_RE.exec(s);
  if (!m) return false;
  const [, y, mo, d, h, mi, sec] = m as unknown as [
    string,
    string,
    string,
    string,
    string,
    string,
    string,
  ];
  if (!plausibleDate(Number(y), Number(mo), Number(d))) return false;
  // Leap seconds (:60) are rejected on purpose — payloads carrying one
  // are so rare that pinning them as plain strings is the safer call.
  return Number(h) <= 23 && Number(mi) <= 59 && Number(sec) <= 59;
}

export function isIsoDate(s: string): boolean {
  const m = DATE_RE.exec(s);
  if (!m) return false;
  const [, y, mo, d] = m as unknown as [string, string, string, string];
  return plausibleDate(Number(y), Number(mo), Number(d));
}

export function isEmail(s: string): boolean {
  return s.length <= 254 && EMAIL_RE.test(s);
}

export function isUrl(s: string): boolean {
  if (!/^https?:\/\/\S+$/.test(s)) return false;
  try {
    const u = new URL(s);
    return u.hostname.length > 0;
  } catch {
    return false;
  }
}

/**
 * Detect the format of a single string value, or null. Detectors are
 * checked from most to least specific; a value can only ever have one
 * format.
 */
export function detectFormat(s: string): StringFormat | null {
  if (isUuid(s)) return "uuid";
  if (isIsoDateTime(s)) return "iso-date-time";
  if (isIsoDate(s)) return "iso-date";
  if (isEmail(s)) return "email";
  if (isUrl(s)) return "url";
  return null;
}
