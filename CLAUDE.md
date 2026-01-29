# Menu Guepards

Daily school menu notification system via Telegram with web interface for PDF upload/config. Data stored in GitHub.

## Tech Stack

- Next.js 14 (App Router), TypeScript, Tailwind CSS
- Vercel (hosting + cron), Telegram Bot API, GitHub API (data persistence)

## Project Structure

```
app/
  api/
    send-menu/       # Telegram send (cron: 10 AM weekdays)
    parse-menu/      # PDF upload & parsing
    auto-fetch-menu/ # Auto PDF fetch (cron: 8 AM days 1-7)
    menus/           # Menu retrieval
  page.tsx           # Main UI
lib/
  menuParser.ts      # PDF parsing (dash format=lunch, line format=dinner)
  telegram.ts        # Telegram integration
  github.ts          # GitHub API
  storage.ts         # Data persistence & GitHub file operations
  types.ts           # TypeScript interfaces
data/                # Menu JSON files (menus-YYYY-MM.json)
pdfs/                # Uploaded PDFs (gitignored)
```

## Key Files

- `vercel.json` - Cron configuration
- `lib/storage.ts` - GitHub file operations
- `lib/menuParser.ts` - PDF parsing logic

## Environment Variables

- `TELEGRAM_BOT_TOKEN` / `TELEGRAM_CHAT_ID`
- `GITHUB_TOKEN`
- `LUNCH_PDF_URL` / `DINNER_PDF_URL` (auto-fetch)
- `CRON_SECRET` (optional)

## Data Format

- Files: `data/menus-YYYY-MM.json`
- Structure: `{ year, month, lunch: DailyMenu[], dinner: DailyMenu[] }`
- DailyMenu: `{ day: number, dishes: string[] }`

## Common Tasks

- Manual menu upload: Web UI
- Test send: "Send Now" button
- Dev server: `npm run dev`
