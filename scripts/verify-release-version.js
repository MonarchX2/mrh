const fs = require("node:fs");
const path = require("node:path");

const expectedDisplayVersion = process.env.DISPLAY_VERSION;
if (!expectedDisplayVersion || !/^\d{2}\.\d{2}\.\d{2}-(?:0|[1-9]\d*)$/.test(expectedDisplayVersion)) {
  throw new Error("DISPLAY_VERSION must be a valid date-based version (YY.MM.DD-N).");
}

const rootDir = path.resolve(__dirname, "..");

// Verify version.json contains the expected version
const versionJsonPath = path.join(rootDir, "version.json");
const versionJson = JSON.parse(fs.readFileSync(versionJsonPath, "utf8"));
if (versionJson.version !== expectedDisplayVersion) {
  throw new Error(
    `Expected version.json to contain version ${expectedDisplayVersion}, found ${versionJson.version}.`,
  );
}

console.log(`Verified version ${expectedDisplayVersion} in version.json`);
