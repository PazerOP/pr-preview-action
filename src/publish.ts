import { execSync } from "child_process";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { injectCacheBustScript } from "./inject-cache-bust";
import { resolveToken, siteUrl } from "./buildhost";

function env(name: string): string {
  return process.env[name] || "";
}

async function main(): Promise<void> {
  const server = env("buildhost_server");
  const project = env("buildhost_project");
  const branch = env("site_branch");
  const sourceDir = env("INPUT_SOURCE_DIR");
  const gitCommit = env("INPUT_GIT_COMMIT") || env("GITHUB_SHA");
  const explicitToken = env("INPUT_TOKEN");

  if (!server || !project || !branch) {
    throw new Error(
      "Missing buildhost_server / buildhost_project / site_branch (the setup step must run first)",
    );
  }
  if (!sourceDir || !fs.existsSync(sourceDir)) {
    throw new Error(`Source directory not found: ${sourceDir}`);
  }

  // Inject the cache-bust helper and record the deployed commit, then package
  // the directory as a gzipped tarball -- buildhost's sites endpoint accepts a
  // tar.gz body (Content-Type: application/gzip).
  injectCacheBustScript(sourceDir);
  const shortSha = env("short_sha");
  if (shortSha) {
    fs.writeFileSync(path.join(sourceDir, "version.txt"), shortSha + "\n");
  }

  const tarPath = path.join(os.tmpdir(), "buildhost-site.tar.gz");
  // --exclude=.git keeps a stray VCS dir out of the upload when source-dir is a
  // repo root; harmless when it is a build subdirectory.
  execSync(`tar -czf "${tarPath}" -C "${sourceDir}" --exclude=.git .`, {
    stdio: "inherit",
  });
  const body = fs.readFileSync(tarPath);
  fs.unlinkSync(tarPath);
  console.log(`Packaged ${sourceDir} (${body.length} bytes)`);

  const token = await resolveToken(explicitToken, server);

  const url = siteUrl(server, project, branch);
  console.log(`Uploading site to ${url}`);
  const resp = await fetch(url, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/gzip",
      "X-Git-Commit": gitCommit,
    },
    body,
  });
  const text = await resp.text();
  if (!resp.ok) {
    throw new Error(`buildhost upload failed: ${resp.status} ${text}`);
  }
  console.log(`Published preview: ${url}/`);
  console.log(text);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
