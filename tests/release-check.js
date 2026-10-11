const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const projectRoot = path.resolve(__dirname, "..");
const manifest = readJson("manifest.json");
const packageInfo = readJson("package.json");
const runtimeDirectories = ["background", "content", "icons", "options", "popup", "shared", "welcome"];

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(projectRoot, relativePath), "utf8"));
}

function requireFile(relativePath) {
  const absolutePath = path.resolve(projectRoot, relativePath);
  assert.ok(absolutePath.startsWith(projectRoot + path.sep), `Path leaves the project: ${relativePath}`);
  assert.ok(fs.existsSync(absolutePath), `Missing ${relativePath}`);
  assert.ok(fs.statSync(absolutePath).isFile(), `${relativePath} is not a file`);
}

function listFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(directory, entry.name);
    return entry.isDirectory() ? listFiles(fullPath) : [fullPath];
  });
}

function checkIcon(sizeText, relativePath) {
  requireFile(relativePath);
  const buffer = fs.readFileSync(path.join(projectRoot, relativePath));
  assert.ok(buffer.length >= 24, `${relativePath} is not a complete PNG`);
  assert.equal(buffer.subarray(0, 8).toString("hex"), "89504e470d0a1a0a", `${relativePath} is not a PNG`);
  const expectedSize = Number(sizeText);
  assert.equal(buffer.readUInt32BE(16), expectedSize, `Wrong width for ${relativePath}`);
  assert.equal(buffer.readUInt32BE(20), expectedSize, `Wrong height for ${relativePath}`);
}

assert.equal(manifest.manifest_version, 3);
assert.equal(manifest.name, "BareWatch");
assert.match(manifest.version, /^\d+\.\d+\.\d+(?:\.\d+)?$/);
assert.equal(packageInfo.version, manifest.version, "Package and manifest versions differ");
assert.ok(manifest.description.length <= 132, "Manifest description is too long");
assert.deepEqual(manifest.permissions, ["storage"]);
assert.equal(manifest.content_scripts.length, 1);
assert.deepEqual(manifest.content_scripts[0].matches, ["https://www.youtube.com/*"]);
assert.deepEqual(manifest.content_scripts[0].js, ["shared/settings.js", "content/content.js"]);
assert.ok(Number(manifest.minimum_chrome_version) >= 105);
assert.ok(manifest.commands["toggle-barewatch"]);

for (const relativePath of [
  manifest.action.default_popup,
  manifest.background.service_worker,
  manifest.options_ui.page,
  "welcome/welcome.html",
  "README.md",
  "PRIVACY.md",
  "SECURITY.md",
  "LICENSE",
  "CHANGELOG.md",
  ".gitignore",
  ".gitattributes",
  ".editorconfig",
  ".github/workflows/checks.yml",
  "docs/RELEASE-CHECKLIST.md",
  "tests/manual-test-matrix.md",
  "store-assets/LISTING-DRAFT.md"
]) {
  requireFile(relativePath);
}

for (const script of manifest.content_scripts) {
  for (const relativePath of [...(script.css || []), ...(script.js || [])]) {
    requireFile(relativePath);
  }
}

for (const iconMap of [manifest.icons, manifest.action.default_icon]) {
  for (const [sizeText, relativePath] of Object.entries(iconMap)) {
    checkIcon(sizeText, relativePath);
  }
}

for (const directory of runtimeDirectories) {
  for (const file of listFiles(path.join(projectRoot, directory))) {
    if (!/\.(?:html|js)$/i.test(file)) continue;
    const source = fs.readFileSync(file, "utf8");
    const relativePath = path.relative(projectRoot, file);

    assert.doesNotMatch(source, /\beval\s*\(/, `${relativePath} uses eval`);
    assert.doesNotMatch(source, /\bnew\s+Function\s*\(/, `${relativePath} constructs executable code`);

    if (file.endsWith(".js")) {
      new vm.Script(source, { filename: relativePath });
      continue;
    }

    for (const tag of source.matchAll(/<(?:script|link)\b[^>]*>/gi)) {
      const asset = tag[0].match(/(?:src|href)=["']([^"']+)["']/i)?.[1];
      if (!asset) continue;
      assert.doesNotMatch(asset, /^(?:[a-z]+:|\/\/)/i, `${relativePath} loads an external asset`);
      requireFile(path.relative(projectRoot, path.resolve(path.dirname(file), asset)));
    }
  }
}

const documentationFiles = [
  ...fs.readdirSync(projectRoot).filter((name) => name.endsWith(".md")).map((name) => path.join(projectRoot, name)),
  ...["docs", "tests", "store-assets"].flatMap((directory) => listFiles(path.join(projectRoot, directory)))
    .filter((file) => file.endsWith(".md"))
];

for (const file of documentationFiles) {
  const source = fs.readFileSync(file, "utf8");
  for (const link of source.matchAll(/\[[^\]]+\]\(([^\s)]+)\)/g)) {
    const destination = link[1].split("#")[0];
    if (!destination || /^[a-z]+:/i.test(destination)) continue;
    requireFile(path.relative(projectRoot, path.resolve(path.dirname(file), destination)));
  }
}

console.log("BareWatch repository and release checks passed.");
