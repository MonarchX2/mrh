const API_BASE_URL = "https://api.github.com";
const API_REQUEST_TIMEOUT_MS = 15_000;
const PAGES_BUILD_TIMEOUT_MS = 10 * 60 * 1000;
const PAGES_BUILD_POLL_INTERVAL_MS = 10_000;

function parseRepository(repository, label) {
  if (typeof repository !== "string") {
    throw new Error(`${label} must be provided as owner/repository.`);
  }
  const trimmedRepository = repository.trim();
  const match = /^([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)$/.exec(trimmedRepository);
  if (
    !match ||
    match[1] === "." ||
    match[1] === ".." ||
    match[2] === "." ||
    match[2] === ".."
  ) {
    throw new Error(`${label} must be provided as owner/repository.`);
  }
  return {
    owner: match[1],
    name: match[2],
    fullName: `${match[1]}/${match[2]}`,
  };
}

function validateConfiguration({
  targetRepository,
  sourceRepository,
  siteUrl,
  token,
}) {
  const trimmedTargetRepository =
    typeof targetRepository === "string" ? targetRepository.trim() : targetRepository;
  const trimmedSourceRepository =
    typeof sourceRepository === "string" ? sourceRepository.trim() : sourceRepository;
  const trimmedSiteUrl = typeof siteUrl === "string" ? siteUrl.trim() : siteUrl;
  const trimmedToken = typeof token === "string" ? token.trim() : token;

  const target = parseRepository(
    trimmedTargetRepository,
    "MRH_PUBLIC_REPOSITORY",
  );
  const source = parseRepository(trimmedSourceRepository, "GITHUB_REPOSITORY");
  if (target.fullName.toLowerCase() === source.fullName.toLowerCase()) {
    throw new Error(
      "MRH_PUBLIC_REPOSITORY must not be the source repository.",
    );
  }

  let parsedSiteUrl;
  try {
    parsedSiteUrl = new URL(trimmedSiteUrl);
  } catch {
    throw new Error(
      "MRH_PUBLIC_SITE_URL must be an HTTPS Pages URL with a trailing slash.",
    );
  }
  if (
    parsedSiteUrl.protocol !== "https:" ||
    parsedSiteUrl.username ||
    parsedSiteUrl.password ||
    parsedSiteUrl.search ||
    parsedSiteUrl.hash ||
    !parsedSiteUrl.pathname.endsWith("/")
  ) {
    throw new Error(
      "MRH_PUBLIC_SITE_URL must be an HTTPS Pages URL with a trailing slash and no credentials, query, or fragment.",
    );
  }
  if (typeof trimmedToken !== "string" || !trimmedToken.trim()) {
    throw new Error("MRH_PUBLIC_DEPLOY_TOKEN must be configured.");
  }

  return {
    target,
    source,
    siteUrl: parsedSiteUrl.href,
    token: trimmedToken,
  };
}

function normalizedSiteUrl(value, label) {
  const trimmedValue = typeof value === "string" ? value.trim() : value;
  let parsed;
  try {
    parsed = new URL(trimmedValue);
  } catch {
    throw new Error(`${label} is not a valid HTTPS URL.`);
  }
  if (
    parsed.protocol !== "https:" ||
    parsed.username ||
    parsed.password ||
    parsed.search ||
    parsed.hash
  ) {
    throw new Error(`${label} is not a valid HTTPS URL.`);
  }
  parsed.pathname = parsed.pathname.replace(/\/+$/, "") || "/";
  return parsed.href;
}

async function requestJson(
  apiPath,
  token,
  {
    apiBaseUrl = API_BASE_URL,
    fetchImpl = fetch,
    timeoutMs = API_REQUEST_TIMEOUT_MS,
  } = {},
) {
  let response;
  try {
    response = await fetchImpl(`${apiBaseUrl}${apiPath}`, {
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "X-GitHub-Api-Version": "2022-11-28",
      },
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    const reason =
      error && error.name === "TimeoutError"
        ? "request timed out"
        : "network request failed";
    throw new Error(`GitHub API ${reason} for ${apiPath}.`);
  }

  if (!response.ok) {
    throw new Error(
      `GitHub API request for ${apiPath} failed with HTTP ${response.status}.`,
    );
  }
  try {
    return await response.json();
  } catch {
    throw new Error(`GitHub API returned invalid JSON for ${apiPath}.`);
  }
}

async function verifyTargetConfiguration(
  configuration,
  { apiBaseUrl, fetchImpl } = {},
) {
  const config = validateConfiguration(configuration);
  const repositoryPath = `/repos/${encodeURIComponent(config.target.owner)}/${encodeURIComponent(config.target.name)}`;
  const options = { apiBaseUrl, fetchImpl };
  const repository = await requestJson(
    repositoryPath,
    config.token,
    options,
  );
  if (!repository || typeof repository !== "object") {
    throw new Error(
      `GitHub API returned invalid repository data for ${config.target.fullName}.`,
    );
  }
  if (repository.private !== false || repository.visibility !== "public") {
    throw new Error(
      `Deployment destination ${config.target.fullName} must be public.`,
    );
  }

  const pages = await requestJson(
    `${repositoryPath}/pages`,
    config.token,
    options,
  );
  if (!pages || typeof pages !== "object") {
    throw new Error(
      `GitHub API returned invalid Pages configuration for ${config.target.fullName}.`,
    );
  }
  if (pages.public !== true) {
    throw new Error(
      `GitHub Pages must be publicly available for ${config.target.fullName}.`,
    );
  }
  if (
    pages.build_type !== "legacy" ||
    !pages.source ||
    pages.source.branch !== "main" ||
    pages.source.path !== "/"
  ) {
    throw new Error(
      `GitHub Pages for ${config.target.fullName} must publish branch main from /(root).`,
    );
  }
  if (
    normalizedSiteUrl(pages.html_url, "GitHub Pages html_url") !==
    normalizedSiteUrl(config.siteUrl, "MRH_PUBLIC_SITE_URL")
  ) {
    throw new Error(
      `MRH_PUBLIC_SITE_URL does not match the configured GitHub Pages URL for ${config.target.fullName}.`,
    );
  }
  return {
    repository: config.target.fullName,
    siteUrl: config.siteUrl,
  };
}

async function waitForPagesBuild(
  {
    targetRepository,
    sourceRepository,
    siteUrl,
    token,
    expectedCommit,
  },
  {
    apiBaseUrl,
    fetchImpl,
    now = Date.now,
    sleep = (durationMs) =>
      new Promise((resolve) => setTimeout(resolve, durationMs)),
    timeoutMs = PAGES_BUILD_TIMEOUT_MS,
    pollIntervalMs = PAGES_BUILD_POLL_INTERVAL_MS,
  } = {},
) {
  const config = validateConfiguration({
    targetRepository,
    sourceRepository,
    siteUrl,
    token,
  });
  if (!/^[0-9a-f]{40}$/i.test(expectedCommit || "")) {
    throw new Error("The published destination commit SHA is invalid.");
  }

  const repositoryPath = `/repos/${encodeURIComponent(config.target.owner)}/${encodeURIComponent(config.target.name)}`;
  const buildPath = `${repositoryPath}/pages/builds/latest`;
  const deadline = now() + timeoutMs;
  let latestBuild = null;

  while (true) {
    latestBuild = await requestJson(buildPath, config.token, {
      apiBaseUrl,
      fetchImpl,
    });
    if (!latestBuild || typeof latestBuild !== "object") {
      throw new Error("GitHub API returned invalid Pages build data.");
    }

    if (latestBuild.commit === expectedCommit) {
      if (latestBuild.status === "built") {
        return latestBuild;
      }
      if (latestBuild.status === "errored") {
        const detail =
          typeof latestBuild.error?.message === "string" &&
          latestBuild.error.message.trim()
            ? `: ${latestBuild.error.message}`
            : ".";
        throw new Error(
          `GitHub Pages build failed for commit ${expectedCommit}${detail}`,
        );
      }
      if (!["queued", "building"].includes(latestBuild.status)) {
        throw new Error(
          `GitHub Pages returned unexpected build status "${latestBuild.status}" for commit ${expectedCommit}.`,
        );
      }
    }

    const remainingMs = deadline - now();
    if (remainingMs <= 0) {
      const status = latestBuild.status || "unknown";
      throw new Error(
        `Timed out after ${timeoutMs}ms waiting for GitHub Pages to build commit ${expectedCommit}; latest status is ${status}.`,
      );
    }
    await sleep(Math.min(pollIntervalMs, remainingMs));
  }
}

function configurationFromEnvironment() {
  return {
    targetRepository: process.env.MRH_PUBLIC_REPOSITORY,
    sourceRepository: process.env.GITHUB_REPOSITORY,
    siteUrl: process.env.MRH_PUBLIC_SITE_URL,
    token: process.env.MRH_PUBLIC_DEPLOY_TOKEN,
  };
}

async function main() {
  const command = process.argv[2];
  if (command === "verify-target") {
    const result = await verifyTargetConfiguration(
      configurationFromEnvironment(),
    );
    console.log(
      `Verified public Pages destination ${result.repository} at ${result.siteUrl}.`,
    );
    return;
  }
  if (command === "wait-for-build") {
    const build = await waitForPagesBuild({
      ...configurationFromEnvironment(),
      expectedCommit: process.env.MRH_PUBLIC_DEPLOY_COMMIT,
    });
    console.log(
      `GitHub Pages build completed for destination commit ${build.commit}.`,
    );
    return;
  }
  throw new Error(
    'Usage: node scripts/public-pages-deployment.js "verify-target|wait-for-build".',
  );
}

module.exports = {
  validateConfiguration,
  verifyTargetConfiguration,
  waitForPagesBuild,
};

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
