/**
 * Present_Mode URL-flag parsing (design "io", task 8.6; Req 10.8).
 *
 * The deployed Application can be opened with a Present_Mode flag in the URL
 * query so that, after the user loads a Presentation_File and the PDF, the app
 * shell (task 15.1) starts directly in Present_Mode instead of Edit_Mode.
 *
 * This helper is PURE: it parses a query string (or a full URL) and reports
 * whether the Present_Mode flag is set. It does NOT read `window.location` or
 * switch modes itself; the app shell calls it with the current location and
 * decides when to enter Present_Mode after loading completes.
 *
 * Accepted spellings of the flag (case-insensitive key, Req 10.8):
 * - `?present` — the key present with no value (or any value other than an
 *   explicit "false"/"0"/"no"/"off").
 * - `?mode=present` — the `mode` key set to `present`.
 */

/**
 * Determine whether the Present_Mode flag is set in a URL query.
 *
 * Accepts either a full URL, a `location`-like object, a bare query string
 * (`"?present"` or `"present"`), or `URLSearchParams`. Parsing is tolerant: a
 * malformed URL string is treated as a bare query string so a caller can pass
 * `window.location.search` directly.
 *
 * @param input A full URL string, a `{ search }`/`{ href }` object,
 *   `URLSearchParams`, or a query string.
 * @returns `true` when the Present_Mode flag is set, `false` otherwise.
 */
export function isPresentModeRequested(
  input: string | URLSearchParams | { search?: string; href?: string } | null | undefined,
): boolean {
  const params = toSearchParams(input);
  if (!params) return false;

  // `?mode=present` (case-insensitive value).
  const mode = params.get('mode');
  if (mode !== null && mode.trim().toLowerCase() === 'present') {
    return true;
  }

  // `?present` — present as a key. An explicit falsy value disables it so that
  // `?present=false` does not accidentally start a presentation.
  if (params.has('present')) {
    const value = params.get('present');
    return !isExplicitFalse(value);
  }

  return false;
}

/** Values that, when given to `?present=<value>`, disable the flag. */
const FALSE_VALUES = new Set(['false', '0', 'no', 'off']);

function isExplicitFalse(value: string | null): boolean {
  if (value === null) return false;
  return FALSE_VALUES.has(value.trim().toLowerCase());
}

/**
 * Coerce the various accepted inputs into a {@link URLSearchParams}. Returns
 * `null` when there is no query to parse.
 */
function toSearchParams(
  input: string | URLSearchParams | { search?: string; href?: string } | null | undefined,
): URLSearchParams | null {
  if (input == null) return null;

  if (input instanceof URLSearchParams) return input;

  if (typeof input === 'string') {
    return parseStringQuery(input);
  }

  // A location-like object: prefer `search`, fall back to parsing `href`.
  if (typeof input.search === 'string') {
    return new URLSearchParams(stripLeadingQuestionMark(input.search));
  }
  if (typeof input.href === 'string') {
    return parseStringQuery(input.href);
  }

  return null;
}

/**
 * Parse a string that may be a full URL or a bare query string into
 * {@link URLSearchParams}. A full URL's query is extracted via the `URL`
 * parser; anything else is treated as a raw query string.
 */
function parseStringQuery(value: string): URLSearchParams {
  // Try full-URL parsing first (handles "https://host/path?present").
  try {
    return new URL(value).searchParams;
  } catch {
    // Not a full URL: treat the whole thing as a query string.
    return new URLSearchParams(stripLeadingQuestionMark(value));
  }
}

/** Remove a single leading `?` so `URLSearchParams` parses the query cleanly. */
function stripLeadingQuestionMark(s: string): string {
  return s.startsWith('?') ? s.slice(1) : s;
}
