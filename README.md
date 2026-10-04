# Menú Guepards

This is just a small app to be able to parse meal pdfs for my kid's school, and then notify about daily meals.

## Operations

Scheduled GET endpoints require `Authorization: Bearer <CRON_SECRET>`. If
`CRON_SECRET` is absent or blank they return 503 without doing work; invalid
credentials return 401. Set the secret in the deployment environment before
enabling scheduled operations. It is never sent to the browser.

Uploads accept non-empty PDFs up to 4 MiB with a `.pdf` filename,
`application/pdf` type, PDF header and end marker. The multipart request is also
bounded while streaming, even without a trustworthy Content-Length. The parser
still validates the PDF structure and its menu month before saving.

Date inputs use years `2000`–`2099` and unpadded months `1`–`12` (for example,
`/api/menus?year=2026&month=10`). Successful GitHub reads for current/future months
revalidate after 60 seconds; historical months after one hour. Saves invalidate
the month's cache immediately. Direct repository edits become visible through
Next.js background revalidation after the TTL; the first read after expiration
can still serve the previous data while refreshing. HTTP responses are not
separately cached. Notifications and writes always fetch fresh data. Concurrent
writes fail on a SHA conflict, so retry after reloading the latest menu.

## Development checks

```sh
npm ci
npm test
npm run lint
npm run typecheck
npm run build
npm run test:integration
```

The integration check starts a temporary localhost production server and verifies
cache hits, conditional writes, preservation of the other meal, and immediate
invalidation after a save. It substitutes fake GitHub responses and blocks other
external fetches. Tests need no production credentials and never send Telegram
messages or write production menu data.
