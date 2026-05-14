// Resilient HubSpot fetch: retries on 429 and 5xx with exponential backoff,
// honoring Retry-After when HubSpot supplies it. Other status codes
// (400/401/403/404/409/etc.) are returned to the caller unchanged so they
// can decide what to do (e.g. 409 means "already exists" and is treated as
// success in some flows).
//
// HubSpot's per-second cap for most tiers is 100 req / 10s. The backoff here
// is reactive — if you blast past the cap, you'll burn 1–2 retries on each
// burst rather than smoothly pacing. A token-bucket pacer can come later;
// for now, retries make the script survive transient throttling instead of
// failing the whole import on the first 429.

export type HubspotFetchOptions = RequestInit & {
  // Maximum retry attempts (not counting the initial request). Default 5.
  maxRetries?: number;
  // Base backoff in ms; actual wait is base * 2^attempt + jitter. Default 500.
  baseDelayMs?: number;
  // Max wait between retries regardless of Retry-After. Default 30s.
  maxDelayMs?: number;
};

const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);

function jitter(ms: number): number {
  return Math.floor(ms * (0.5 + Math.random()));
}

function parseRetryAfter(header: string | null): number | null {
  if (!header) return null;
  const asSeconds = Number(header);
  if (Number.isFinite(asSeconds) && asSeconds >= 0) return Math.round(asSeconds * 1000);
  const asDate = Date.parse(header);
  if (!Number.isNaN(asDate)) return Math.max(0, asDate - Date.now());
  return null;
}

export async function hubspotFetch(
  input: RequestInfo | URL,
  options: HubspotFetchOptions = {},
): Promise<Response> {
  const { maxRetries = 5, baseDelayMs = 500, maxDelayMs = 30_000, ...init } = options;

  let attempt = 0;
  while (true) {
    let res: Response;
    try {
      res = await fetch(input, init);
    } catch (err) {
      // Network error — retry like a 5xx if we have budget.
      if (attempt >= maxRetries) throw err;
      const wait = Math.min(maxDelayMs, jitter(baseDelayMs * 2 ** attempt));
      await new Promise((r) => setTimeout(r, wait));
      attempt++;
      continue;
    }

    if (!RETRYABLE_STATUS.has(res.status) || attempt >= maxRetries) return res;

    // Drain the body so the connection can be reused.
    await res.text().catch(() => "");
    const retryAfter = parseRetryAfter(res.headers.get("retry-after"));
    const exp = jitter(baseDelayMs * 2 ** attempt);
    const wait = Math.min(maxDelayMs, retryAfter ?? exp);
    await new Promise((r) => setTimeout(r, wait));
    attempt++;
  }
}
