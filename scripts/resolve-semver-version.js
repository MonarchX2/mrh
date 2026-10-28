const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const rootDir = path.resolve(__dirname, "..");

function getReleaseContext(repositoryDir = rootDir, commitSha = process.env.GITHUB_SHA) {
  // Read version from version.json (date-based versioning)
  const versionJson = JSON.parse(
    fs.readFileSync(path.join(repositoryDir, "version.json"), "utf8"),
  );
  const displayVersion = versionJson.version;

  if (!/^\d{2}\.\d{2}\.\d{2}-(?:0|[1-9]\d*)$/.test(displayVersion)) {
    throw new Error(`Invalid date-based version in version.json: ${displayVersion}`);
  }

  const sha = (
    commitSha ||
    execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: repositoryDir,
      encoding: "utf8",
    })
  )
    .trim()
    .slice(0, 12);

  // Check if this version already has a tag
  const tags = execFileSync(
    "git",
    ["tag", "--list", `v${displayVersion}`],
    { cwd: repositoryDir, encoding: "utf8" },
  )
    .trim()
    .split(/\r?\n/)
    .filter((tag) => tag.trim());

  const shouldTag = tags.length === 0;

  return {
    baseVersion: displayVersion,
    displayVersion,
    releaseVersion: `mrh-${displayVersion}-${sha}`,
    releaseTag: `v${displayVersion}`,
    shouldTag,
  };
}

if (require.main === module) {
  const release = getReleaseContext();
  const outputs = [
    `display_version=${release.displayVersion}`,
    `release_version=${release.releaseVersion}`,
    `release_tag=${release.releaseTag}`,
    `should_tag=${release.shouldTag}`,
  ];
  if (process.env.GITHUB_OUTPUT) {
    fs.appendFileSync(process.env.GITHUB_OUTPUT, `${outputs.join("\n")}\n`);
  } else {
    console.log(outputs.join("\n"));
  }
}

module.exports = { getReleaseContext };
