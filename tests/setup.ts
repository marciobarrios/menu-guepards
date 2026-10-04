import { afterEach, beforeEach, vi } from "vitest";

beforeEach(() => {
  // Tests must never send Telegram messages, fetch school PDFs, or write GitHub.
  vi.stubGlobal("fetch", vi.fn(() => {
    throw new Error("Unexpected network request in test");
  }));
  vi.stubEnv("GITHUB_TOKEN", "test-only-github-token");
  vi.stubEnv("CRON_SECRET", "test-only-cron-secret");
  vi.stubEnv("OWNER_SECRET", "test-only-owner-secret");
  vi.stubEnv("TELEGRAM_BOT_TOKEN", "");
  vi.stubEnv("TELEGRAM_CHAT_ID", "");
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.useRealTimers();
});
