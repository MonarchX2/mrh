const fs = require("node:fs");
const path = require("node:path");

const displayVersion = process.env.DISPLAY_VERSION;
if (!displayVersion || !/^\d{2}\.\d{2}\.\d{2}-(?:0|[1-9]\d*)$/.test(displayVersion)) {
  throw new Error("DISPLAY_VERSION must be a valid date-based version (YY.MM.DD-N).");
}

const rootDir = path.resolve(__dirname, "..");

// Only update version.json - the other files handle versioning dynamically at runtime
const versionJsonPath = path.join(rootDir, "version.json");
const versionJson = JSON.parse(fs.readFileSync(versionJsonPath, "utf8"));
versionJson.version = displayVersion;
fs.writeFileSync(versionJsonPath, JSON.stringify(versionJson, null, 2) + "\n");

console.log(`Stamped version ${displayVersion} in version.json`);
