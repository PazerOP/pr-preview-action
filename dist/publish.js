"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const child_process_1 = require("child_process");
const fs = __importStar(require("fs"));
const os = __importStar(require("os"));
const path = __importStar(require("path"));
const inject_cache_bust_1 = require("./inject-cache-bust");
const buildhost_1 = require("./buildhost");
function env(name) {
    return process.env[name] || "";
}
async function main() {
    const server = env("buildhost_server");
    const project = env("buildhost_project");
    const branch = env("site_branch");
    const sourceDir = env("INPUT_SOURCE_DIR");
    const gitCommit = env("INPUT_GIT_COMMIT") || env("GITHUB_SHA");
    const explicitToken = env("INPUT_TOKEN");
    if (!server || !project || !branch) {
        throw new Error("Missing buildhost_server / buildhost_project / site_branch (the setup step must run first)");
    }
    if (!sourceDir || !fs.existsSync(sourceDir)) {
        throw new Error(`Source directory not found: ${sourceDir}`);
    }
    // Inject the cache-bust helper and record the deployed commit, then package
    // the directory as a gzipped tarball -- buildhost's sites endpoint accepts a
    // tar.gz body (Content-Type: application/gzip).
    (0, inject_cache_bust_1.injectCacheBustScript)(sourceDir);
    const shortSha = env("short_sha");
    if (shortSha) {
        fs.writeFileSync(path.join(sourceDir, "version.txt"), shortSha + "\n");
    }
    const tarPath = path.join(os.tmpdir(), "buildhost-site.tar.gz");
    // --exclude=.git keeps a stray VCS dir out of the upload when source-dir is a
    // repo root; harmless when it is a build subdirectory.
    (0, child_process_1.execSync)(`tar -czf "${tarPath}" -C "${sourceDir}" --exclude=.git .`, {
        stdio: "inherit",
    });
    const body = fs.readFileSync(tarPath);
    fs.unlinkSync(tarPath);
    console.log(`Packaged ${sourceDir} (${body.length} bytes)`);
    const token = await (0, buildhost_1.resolveToken)(explicitToken, server);
    const url = (0, buildhost_1.siteUrl)(server, project, branch);
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
