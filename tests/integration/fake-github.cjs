// Preloaded only by the local smoke test. No fetch can reach an external service.
const { appendFileSync } = require("node:fs");
let menus = { year: 2026, month: 10, lunch: [], dinner: [{ day: 5, dishes: ["Preserved dinner"] }] };
let sha = "initial-sha";

globalThis.fetch = async (input, init = {}) => {
  const url = new URL(typeof input === "string" ? input : input.url);
  if (url.origin !== "https://api.github.com" ||
      url.pathname !== "/repos/marciobarrios/menu-guepards/contents/data/menus-2026-10.json") {
    throw new Error("Unexpected external request in smoke test");
  }
  const method = init.method || "GET";
  appendFileSync(process.env.MOCK_GITHUB_LOG, `${method}\n`);
  if (method === "PUT") {
    const body = JSON.parse(init.body);
    if (body.sha !== sha) return new Response("SHA conflict", { status: 409 });
    menus = JSON.parse(Buffer.from(body.content, "base64").toString());
    sha = "saved-sha";
    return Response.json({});
  }
  if (method !== "GET") throw new Error("Unexpected GitHub method");
  return Response.json({ content: Buffer.from(JSON.stringify(menus)).toString("base64"), sha });
};
