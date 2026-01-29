/**
 * Utility to fetch PDF from URL and return as Buffer.
 */

export async function fetchPdfFromUrl(url: string): Promise<Buffer | null> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);

    const response = await fetch(url, {
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      console.error(`PDF fetch failed: ${response.status} ${response.statusText}`);
      return null;
    }

    const contentType = response.headers.get("content-type") || "";
    if (!contentType.includes("application/pdf")) {
      console.error(`Invalid content-type: ${contentType} (expected application/pdf)`);
      return null;
    }

    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      console.error("PDF fetch timed out after 30 seconds");
    } else {
      console.error("PDF fetch error:", error);
    }
    return null;
  }
}
