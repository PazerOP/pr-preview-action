import { execSync } from "child_process";
import * as fs from "fs";
import * as path from "path";
import { injectCacheBustScript } from "./inject-cache-bust";
import { githubApi } from "./github";

function env(name: string): string {
  return process.env[name] || "";
}

function run(cmd: string, cwd?: string): void {
  console.log(`$ ${cmd}`);
  execSync(cmd, { stdio: "inherit", cwd });
}

/**
 * Parse the INPUT_SHARED_DIRS env var into an array of directory names.
 * Accepts comma-separated values, trims whitespace, drops empties.
 */
function parseSharedDirs(): string[] {
  const raw = env("INPUT_SHARED_DIRS");
  if (!raw) return [];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Merge sourceDir/sharedName into destRoot/sharedName (additive).
 * Existing files with the same name are overwritten.
 * Files already in destRoot/sharedName that are NOT in source are preserved.
 */
function mergeSharedDir(
  sourceBase: string,
  destRoot: string,
  sharedName: string,
): void {
  const src = path.join(sourceBase, sharedName);
  if (!fs.existsSync(src) || !fs.statSync(src).isDirectory()) {
    return;
  }
  const dest = path.join(destRoot, sharedName);
  fs.mkdirSync(dest, { recursive: true });
  run(`cp -r "${src}"/. "${dest}/"`);
}

/**
 * Remove a directory from sourceBase (the deploy artifact staging area)
 * so it won't be copied into the per-PR preview directory.
 */
function removeFromSource(sourceBase: string, dirName: string): void {
  const p = path.join(sourceBase, dirName);
  if (fs.existsSync(p)) {
    fs.rmSync(p, { recursive: true });
  }
}

/**
 * Scan a directory for packument files and collect referenced tarball
 * filenames from dist.tarball URLs.
 */
function collectReferencedTarballs(packumentDir: string): Set<string> {
  const refs = new Set<string>();
  if (!fs.existsSync(packumentDir)) return refs;

  for (const entry of fs.readdirSync(packumentDir)) {
    const fullPath = path.join(packumentDir, entry);
    // Skip directories, dotfiles, and known non-packument files
    if (entry.startsWith(".")) continue;
    let stat;
    try {
      stat = fs.statSync(fullPath);
    } catch {
      continue;
    }
    if (stat.isDirectory()) continue;

    try {
      const data = JSON.parse(fs.readFileSync(fullPath, "utf8"));
      if (!data.versions || typeof data.versions !== "object") continue;
      for (const ver of Object.values(data.versions)) {
        const url = (ver as { dist?: { tarball?: string } }).dist?.tarball;
        if (url) {
          refs.add(path.basename(url));
        }
      }
    } catch {
      // Not valid JSON / not a packument -- skip
    }
  }
  return refs;
}

/**
 * Check whether a pull request is still open.
 */
async function isPrOpen(prNumber: string): Promise<boolean> {
  const repo = env("GITHUB_REPOSITORY");
  try {
    const pr = (await githubApi(
      "GET",
      `/repos/${repo}/pulls/${prNumber}`,
    )) as { state: string };
    return pr.state === "open";
  } catch {
    return true;
  }
}

/**
 * Remove preview directories for closed PRs, then GC shared dirs.
 */
async function cleanupClosedPreviews(
  ghPagesDir: string,
  umbrellaDir: string,
  sharedDirs: string[],
): Promise<void> {
  const umbrella = path.join(ghPagesDir, umbrellaDir);
  if (!fs.existsSync(umbrella)) return;

  let removedAny = false;

  for (const entry of fs.readdirSync(umbrella)) {
    const match = entry.match(/^pr-(\d+)$/);
    if (!match) continue;
    const prNumber = match[1];

    if (await isPrOpen(prNumber)) continue;

    console.log(`Removing stale preview for PR #${prNumber}`);
    fs.rmSync(path.join(umbrella, entry), { recursive: true });
    removedAny = true;
  }

  if (removedAny) {
    gcSharedDirs(ghPagesDir, sharedDirs, umbrellaDir);
  }
}

/**
 * Garbage-collect shared dirs.
 * For each shared dir, scan all remaining packuments (root + other PR
 * previews) and delete files that are no longer referenced.
 */
function gcSharedDirs(
  ghPagesDir: string,
  sharedDirs: string[],
  umbrellaDir: string,
): void {
  if (sharedDirs.length === 0) return;

  // Collect all referenced tarball filenames from all packuments
  const allRefs = new Set<string>();

  // Scan root-level packuments
  for (const name of collectReferencedTarballs(ghPagesDir)) {
    allRefs.add(name);
  }

  // Scan all remaining PR preview packuments
  const umbrella = path.join(ghPagesDir, umbrellaDir);
  if (fs.existsSync(umbrella)) {
    for (const prDir of fs.readdirSync(umbrella)) {
      const prPath = path.join(umbrella, prDir);
      if (!fs.statSync(prPath).isDirectory()) continue;
      for (const name of collectReferencedTarballs(prPath)) {
        allRefs.add(name);
      }
    }
  }

  // Delete unreferenced files from each shared dir
  for (const sharedName of sharedDirs) {
    const sharedPath = path.join(ghPagesDir, sharedName);
    if (!fs.existsSync(sharedPath) || !fs.statSync(sharedPath).isDirectory()) {
      continue;
    }

    let removed = 0;
    for (const file of fs.readdirSync(sharedPath)) {
      if (!allRefs.has(file)) {
        fs.rmSync(path.join(sharedPath, file), { recursive: true });
        removed++;
      }
    }
    if (removed > 0) {
      console.log(
        `GC: removed ${removed} unreferenced file(s) from ${sharedName}/`,
      );
    }
  }
}

async function main(): Promise<void> {
  const mode = process.argv[2];
  if (mode !== "deploy") {
    console.error(`Usage: git-update.ts deploy`);
    process.exit(1);
  }

  const branch = env("INPUT_BRANCH");
  const token = env("INPUT_TOKEN");
  const repo = env("GITHUB_REPOSITORY");
  const targetPath = env("INPUT_TARGET_PATH");
  const commitMessage = env("INPUT_COMMIT_MESSAGE");
  const sourceDir = env("INPUT_SOURCE_DIR");
  const workspace = env("GITHUB_WORKSPACE");
  const runnerTemp = env("RUNNER_TEMP") || path.join(workspace, "..");
  const dir = path.join(runnerTemp, "__gh-pages-content");
  const sharedDirs = parseSharedDirs();
  const umbrellaDir = env("INPUT_UMBRELLA_DIR") || "pr-preview";

  // Restore from cache or clone
  const cacheHit = env("CACHE_HIT") === "true";

  if (cacheHit && fs.existsSync(dir)) {
    console.log("Cache hit -- reusing cached gh-pages content (skipping clone)");
    run("git init", dir);
    run(`git checkout --orphan "${branch}"`, dir);
    run(
      `git remote add origin "https://x-access-token:${token}@github.com/${repo}.git"`,
      dir,
    );
  } else {
    if (fs.existsSync(dir)) {
      fs.rmSync(dir, { recursive: true });
    }

    try {
      run(
        `git clone --depth 1 --branch "${branch}" "https://x-access-token:${token}@github.com/${repo}.git" "${dir}"`,
      );
    } catch {
      fs.mkdirSync(dir, { recursive: true });
      run("git init", dir);
      run(`git checkout --orphan "${branch}"`, dir);
      run(
        `git remote add origin "https://x-access-token:${token}@github.com/${repo}.git"`,
        dir,
      );
    }
  }

  const sourcePath = path.join(workspace, sourceDir);

  if (targetPath === "") {
    // Root deployment: preserve .git, umbrella dir, and shared dirs
    const preserveSet = new Set([".git", umbrellaDir, ...sharedDirs]);
    for (const entry of fs.readdirSync(dir)) {
      if (preserveSet.has(entry)) continue;
      fs.rmSync(path.join(dir, entry), { recursive: true });
    }

    // Merge shared dirs from artifact into root (additive)
    for (const sd of sharedDirs) {
      mergeSharedDir(sourcePath, dir, sd);
    }

    // Remove shared dirs from source so cp doesn't overwrite the merged dirs
    for (const sd of sharedDirs) {
      removeFromSource(sourcePath, sd);
    }

    run(`cp -r "${sourcePath}"/. "${dir}/"`);
    injectCacheBustScript(dir);
    const shortSha = env("short_sha");
    if (shortSha) {
      fs.writeFileSync(path.join(dir, "version.txt"), shortSha + "\n");
    }
  } else {
    // PR preview deployment
    const target = path.join(dir, targetPath);
    if (fs.existsSync(target)) {
      fs.rmSync(target, { recursive: true });
    }
    fs.mkdirSync(target, { recursive: true });

    // Merge shared dirs from artifact into root-level shared dirs
    for (const sd of sharedDirs) {
      mergeSharedDir(sourcePath, dir, sd);
    }

    // Remove shared dirs from source so they don't end up in the PR subdir
    for (const sd of sharedDirs) {
      removeFromSource(sourcePath, sd);
    }

    run(`cp -r "${sourcePath}"/. "${target}/"`);
    injectCacheBustScript(target);
    const shortSha = env("short_sha");
    if (shortSha) {
      fs.writeFileSync(path.join(target, "version.txt"), shortSha + "\n");
    }
  }

  await cleanupClosedPreviews(dir, umbrellaDir, sharedDirs);

  // Commit and push as a single-commit orphan.
  // Force-pushing an orphan on every deploy caps the preview branch at
  // "current site contents", preventing accumulation of large superseded
  // artifacts (Go binaries, npm tarballs, ...).
  run('git config user.name "pr-preview-action[bot]"', dir);
  run(
    'git config user.email "pr-preview-action[bot]@users.noreply.github.com"',
    dir,
  );
  const orphanRef = "__pr_preview_action_orphan";
  run(`git checkout --orphan "${orphanRef}"`, dir);
  run("git add -A", dir);
  run(`git commit --allow-empty -m "${commitMessage}"`, dir);
  run(`git push --force origin "${orphanRef}:${branch}"`, dir);

  // Export the deployed commit SHA for cache keying
  const deploySha = execSync("git rev-parse HEAD", { cwd: dir })
    .toString()
    .trim();
  const envFile = env("GITHUB_ENV");
  if (envFile) {
    fs.appendFileSync(envFile, `deploy_commit_sha=${deploySha}\n`);
  }

  // Remove .git so the directory is clean for artifact upload
  fs.rmSync(path.join(dir, ".git"), { recursive: true });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
