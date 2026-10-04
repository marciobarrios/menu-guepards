import { beforeEach, describe, expect, it, vi } from "vitest";
import { revalidateTag } from "next/cache";
import { getFileFromGitHub, saveFileToGitHub } from "@/lib/github";
import { loadMenus, updateMenus, updateLunchMenus, updateDinnerMenus, getTodayMenus } from "@/lib/storage";

vi.mock("next/cache", () => ({ revalidateTag: vi.fn() }));
const stored = { year: 2026, month: 10, lunch: [{ day: 5, dishes: ["Old lunch"] }], dinner: [{ day: 5, dishes: ["Dinner"] }] };

function fileResponse(menus = stored, sha = "original-sha") {
  return Response.json({ content: Buffer.from(JSON.stringify(menus)).toString("base64"), sha });
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-05T09:00:00Z"));
});

describe("read caching", () => {
  it.each([[2026, 10, 60], [2026, 9, 3600], [2026, 11, 60]])("tags %i/%i with TTL %i", async (year, month, ttl) => {
    vi.mocked(fetch).mockResolvedValueOnce(fileResponse());
    await loadMenus(year, month);
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining(`menus-${year}-${String(month).padStart(2, "0")}.json`), expect.objectContaining({
      next: { revalidate: ttl, tags: [`menus-${year}-${String(month).padStart(2, "0")}`] },
    }));
  });
  it("keeps fresh reads and notification data uncached", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(fileResponse()).mockResolvedValueOnce(fileResponse());
    await loadMenus(2026, 10, { fresh: true });
    const today = await getTodayMenus();
    expect(today.lunch).toEqual(stored.lunch[0]);
    for (const [, options] of vi.mocked(fetch).mock.calls) {
      expect(options?.cache).toBe("no-store");
      expect(options).not.toHaveProperty("next");
    }
  });
  it("rejects invalid date paths without network access", async () => {
    await expect(loadMenus(2026, 13)).rejects.toThrow("Invalid year or month");
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe("safe saves and invalidation", () => {
  it.each(["lunch", "dinner"] as const)("preserves the other meal when saving %s and uses the merged content's SHA", async type => {
    vi.mocked(fetch).mockResolvedValueOnce(fileResponse()).mockResolvedValueOnce(Response.json({}));
    const meal = [{ day: 5, dishes: ["New meal"] }];
    const result = await (type === "lunch" ? updateLunchMenus : updateDinnerMenus)(2026, 10, meal);
    expect(result.success).toBe(true);
    expect(fetch).toHaveBeenCalledTimes(2); // one fresh read, one conditional write
    const [url, options] = vi.mocked(fetch).mock.calls[1];
    expect(url).toContain("contents/data/menus-2026-10.json");
    expect(options?.method).toBe("PUT");
    expect(options?.cache).toBe("no-store");
    const body = JSON.parse(options?.body as string);
    expect(body.sha).toBe("original-sha");
    expect(JSON.parse(Buffer.from(body.content, "base64").toString())).toEqual({ ...stored, [type]: meal });
    expect(revalidateTag).toHaveBeenCalledExactlyOnceWith("menus-2026-10");
    expect(vi.mocked(fetch).mock.calls[0][1]?.cache).toBe("no-store");
  });
  it("saves both meals with one PUT", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response(null, { status: 404 })).mockResolvedValueOnce(Response.json({}));
    expect((await updateMenus(2026, 10, { lunch: stored.lunch, dinner: stored.dinner })).success).toBe(true);
    const body = JSON.parse(vi.mocked(fetch).mock.calls[1][1]?.body as string);
    expect(body).not.toHaveProperty("sha");
    expect(fetch).toHaveBeenCalledTimes(2);
  });
  it.each([409, 500])("does not invalidate or retry over another writer on HTTP %i", async status => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(fetch).mockResolvedValueOnce(fileResponse()).mockResolvedValueOnce(new Response("failure", { status }));
    expect((await updateLunchMenus(2026, 10, [])).success).toBe(false);
    expect(revalidateTag).not.toHaveBeenCalled();
    expect(fetch).toHaveBeenCalledTimes(2);
  });
  it("does not overwrite malformed existing JSON", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(Response.json({ content: Buffer.from("broken").toString("base64"), sha: "sha" }));
    expect((await updateLunchMenus(2026, 10, [])).success).toBe(false);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(revalidateTag).not.toHaveBeenCalled();
  });
  it("retains fresh SHA reads for standalone GitHub writes", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(fileResponse()).mockResolvedValueOnce(Response.json({}));
    await saveFileToGitHub("data/menus-2026-10.json", "{}", "test");
    expect(vi.mocked(fetch).mock.calls[0][1]?.cache).toBe("no-store");
    expect(JSON.parse(vi.mocked(fetch).mock.calls[1][1]?.body as string).sha).toBe("original-sha");
  });
  it("does not make requests without a GitHub token", async () => {
    vi.stubEnv("GITHUB_TOKEN", "");
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await getFileFromGitHub("data/menus-2026-10.json")).toBeNull();
    expect(await saveFileToGitHub("data/menus-2026-10.json", "{}", "test")).toBe(false);
    expect(fetch).not.toHaveBeenCalled();
  });
});
