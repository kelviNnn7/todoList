#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;

function readText(path) {
  return readFileSync(path, "utf8");
}

function readCargoVersion(path) {
  const packageBlock = readText(path)
    .split(/^\[/m)
    .find((block) => block.startsWith("package]"));
  const match = packageBlock?.match(/^\s*version\s*=\s*"([^"]+)"/m);
  return match?.[1] ?? null;
}

export function readVersions(root = repositoryRoot) {
  const packageJson = JSON.parse(readText(join(root, "package.json")));
  const tauriConfig = JSON.parse(readText(join(root, "src-tauri", "tauri.conf.json")));
  return {
    packageJson: packageJson.version,
    tauriConfig: tauriConfig.version,
    cargoToml: readCargoVersion(join(root, "src-tauri", "Cargo.toml")),
  };
}

export function assertVersions(versions) {
  const invalid = Object.entries(versions).filter(([, version]) => !SEMVER.test(version ?? ""));
  if (invalid.length > 0) {
    throw new Error(`版本号不是有效的 semver：${invalid.map(([name, version]) => `${name}=${version ?? "缺失"}`).join("、")}`);
  }

  const majors = new Set(Object.values(versions).map((version) => version.split(".")[0]));
  if (majors.size !== 1) {
    throw new Error(`主版本不一致：${Object.entries(versions).map(([name, version]) => `${name}=${version}`).join("、")}`);
  }

  const distinct = new Set(Object.values(versions));
  if (distinct.size !== 1) {
    throw new Error(`完整版本不一致：${Object.entries(versions).map(([name, version]) => `${name}=${version}`).join("、")}。请先统一版本再打包。`);
  }

  return versions.packageJson;
}

function main() {
  const versions = readVersions();
  const version = assertVersions(versions);
  if (process.argv.includes("--print-version")) {
    process.stdout.write(version);
    return;
  }
  console.log(`应用版本一致：${version}（package.json / src-tauri/tauri.conf.json / src-tauri/Cargo.toml）`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
