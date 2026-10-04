import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { menuPdf } from "../fixtures/menu-pdf.mjs";

const probe = createServer();
probe.listen(0, "127.0.0.1");
await once(probe, "listening");
const port = probe.address().port;
await new Promise(resolve => probe.close(resolve));
const dir = mkdtempSync(join(tmpdir(), "menu-cache-test-"));
const logFile = join(dir, "github.log");
const server = spawn(process.execPath, [
  "--require", "./tests/integration/fake-github.cjs",
  "./node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", String(port),
], {
  env: {
    ...process.env, MOCK_GITHUB_LOG: logFile,
    // Unique token isolates the framework cache between test runs.
    GITHUB_TOKEN: `test-only-${Date.now()}`, CRON_SECRET: "test-only-cron-secret",
    OWNER_SECRET: "test-only-owner-secret",
    TELEGRAM_BOT_TOKEN: "", TELEGRAM_CHAT_ID: "", NEXT_TELEMETRY_DISABLED: "1",
  },
  stdio: ["ignore", "pipe", "pipe"],
});
let output = "";
server.stdout.on("data", data => { output += data; });
server.stderr.on("data", data => { output += data; });
const origin = `http://127.0.0.1:${port}`;
const events = () => readFileSync(logFile, "utf8").trim().split("\n");
const readMenus = async () => {
  const response = await fetch(`${origin}/api/menus?year=2026&month=10`);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  return (await response.json()).menus;
};

try {
  let ready = false;
  for (let i = 0; i < 100; i++) {
    if (server.exitCode !== null) throw new Error("Local server exited");
    try {
      const response = await fetch(`${origin}/api/menus?year=bad&month=10`);
      ready = response.status === 400;
      if (ready) break;
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert.ok(ready, "Local server did not become ready");
  assert.deepEqual((await readMenus()).lunch, []);
  assert.deepEqual((await readMenus()).lunch, []);
  assert.deepEqual(events(), ["GET"], "Repeated reads must hit Next's data cache");

  for (const path of ["parse-menu", "send-menu"]) {
    for (const headers of [{}, { authorization: "Bearer test-only-cron-secret" }]) {
      const denied = await fetch(`${origin}/api/${path}`, { method: "POST", body: "invalid upload", headers });
      assert.equal(denied.status, 401, "Manual operations require the owner credential");
      assert.equal(denied.headers.get("cache-control"), "no-store");
    }
  }
  assert.deepEqual(events(), ["GET"], "Unauthorized requests must not read or write GitHub");

  const form = new FormData();
  form.set("file", new Blob([menuPdf()], { type: "application/pdf" }), "menu.pdf");
  form.set("year", "2026");
  form.set("month", "10");
  form.set("type", "lunch");
  form.set("save", "true");
  const saved = await fetch(`${origin}/api/parse-menu`, {
    method: "POST", body: form, headers: { authorization: "Bearer test-only-owner-secret" },
  });
  assert.equal(saved.status, 200, await saved.clone().text());
  assert.equal((await saved.json()).saved, true);
  assert.deepEqual(events(), ["GET", "GET", "PUT"], "Save must read a fresh SHA and write once");

  const afterSave = await readMenus();
  assert.equal(afterSave.lunch[0].dishes[0], "Test dish");
  assert.equal(afterSave.dinner[0].dishes[0], "Preserved dinner");
  await readMenus();
  assert.deepEqual(events(), ["GET", "GET", "PUT", "GET"], "Save must invalidate and repopulate the cache");
  console.log("Production-server smoke test passed: public cache hit, owner authorization, fresh conditional save, preserved dinner, immediate invalidation.");
} catch (error) {
  console.error(output);
  throw error;
} finally {
  server.kill("SIGTERM");
  if (server.exitCode === null) await once(server, "exit");
  rmSync(dir, { recursive: true, force: true });
}
