const REPO_OWNER = "marciobarrios";
const REPO_NAME = "menu-guepards";
const BRANCH = "main";

interface GitHubFileResponse {
  sha: string;
  content: string;
}

export async function getFileFromGitHub(path: string): Promise<{ content: string; sha: string } | null> {
  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    console.error("GITHUB_TOKEN not configured");
    return null;
  }

  try {
    const response = await fetch(
      `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/${path}?ref=${BRANCH}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github.v3+json",
        },
      }
    );

    if (response.status === 404) {
      return null;
    }

    if (!response.ok) {
      throw new Error(`GitHub API error: ${response.status}`);
    }

    const data: GitHubFileResponse = await response.json();
    const content = Buffer.from(data.content, "base64").toString("utf-8");
    return { content, sha: data.sha };
  } catch (error) {
    console.error("Error fetching from GitHub:", error);
    return null;
  }
}

export async function saveFileToGitHub(
  path: string,
  content: string,
  message: string
): Promise<boolean> {
  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    console.error("GITHUB_TOKEN not configured");
    return false;
  }

  try {
    // First, try to get the current file to get its SHA (needed for updates)
    const existing = await getFileFromGitHub(path);

    const body: Record<string, string> = {
      message,
      content: Buffer.from(content).toString("base64"),
      branch: BRANCH,
    };

    // If file exists, include SHA to update it
    if (existing) {
      body.sha = existing.sha;
    }

    const response = await fetch(
      `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/${path}`,
      {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github.v3+json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      }
    );

    if (!response.ok) {
      const error = await response.text();
      console.error("GitHub API error:", error);
      return false;
    }

    return true;
  } catch (error) {
    console.error("Error saving to GitHub:", error);
    return false;
  }
}
