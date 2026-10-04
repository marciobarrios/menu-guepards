# Menú Guepards

This is just a small app to be able to parse meal pdfs for my kid's school, and then notify about daily meals.

## Operations

Manual PDF preview/save (`POST /api/parse-menu`) and Telegram sending
(`POST /api/send-menu`) require `Authorization: Bearer <OWNER_SECRET>` or a valid
remembered-device cookie before reading an upload or doing other work.
Cookie-authorized mutations also require an exact same-origin request. Public menu viewing needs no secret.
Missing/blank configuration disables manual operations with 503; missing/wrong
credentials return 401. A cron credential cannot substitute for the owner secret.

Generate a long random owner secret, for example with `openssl rand -hex 32`.
Keep it distinct from `CRON_SECRET`, and store it in your password manager.

- Locally: set `OWNER_SECRET=your-generated-value` in the project's gitignored
  `.env.local`, then restart the development server. `.env` also works and is
  gitignored in this repository; `.env.local` is preferable for local secrets.
- Vercel: open the project's **Settings → Environment Variables** and add
  `OWNER_SECRET` for Production, plus Preview if manual actions should work there.
  Use separate values for development, preview, and production. Environment
  changes take effect on a new deployment; existing deployments are unchanged.
- In the app: enter the matching value in **Clau de propietari**. Without opting
  in, it stays only in page memory and clears on reload, **Esborrar clau**, or an
  authentication failure. Use HTTPS outside localhost development.
- To stay signed in, click **Recordar aquest dispositiu**. The server verifies
  the secret, then stores an opaque signed token in an HttpOnly, Secure,
  SameSite=Strict, host-only cookie. The password is cleared from page memory and
  is never stored in the cookie, localStorage, or sessionStorage. Local HTTP
  loopback development uses a separate non-Secure cookie name.
- Remembered tokens have **no application expiry**. Browser cookie retention is
  set to 400 days and renewed on each page visit. Browsers may cap the lifetime,
  clear cookies, or remove them earlier, so literal permanent storage cannot be
  guaranteed. See [Chrome's cookie lifetime limits](https://developer.chrome.com/blog/cookie-max-age-expires/).
- **Oblidar aquest dispositiu** removes the cookie from this browser. Rotating
  `OWNER_SECRET` invalidates all issued tokens once the new value is deployed.
  Tokens are stateless and origin-bound; forgetting removes the local copy,
  while revoking any copied token requires secret rotation. No database or
  additional secret is needed.

Never commit the real value or prefix its name with `NEXT_PUBLIC_`. Only the empty
template belongs in `.env.example`; the configured server secret is never embedded
in HTML, browser JavaScript, or API responses.

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
remembered sessions, same-origin checks, forgetting, cache hits, conditional writes,
preservation of the other meal, and immediate invalidation after a save.
It substitutes fake GitHub responses and blocks other
external fetches. Tests need no production credentials and never send Telegram
messages or write production menu data.
