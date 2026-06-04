"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const buildhost_1 = require("./buildhost");
function env(name) {
    return process.env[name] || "";
}
async function main() {
    const server = env("buildhost_server");
    const project = env("buildhost_project");
    const branch = env("site_branch");
    const explicitToken = env("INPUT_TOKEN");
    if (!server || !project || !branch) {
        throw new Error("Missing buildhost_server / buildhost_project / site_branch (the setup step must run first)");
    }
    const token = await (0, buildhost_1.resolveToken)(explicitToken, server);
    const url = (0, buildhost_1.siteUrl)(server, project, branch);
    console.log(`Removing preview: ${url}`);
    const resp = await fetch(url, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
    });
    if (resp.status === 404) {
        console.log("No preview to remove (already gone)");
        return;
    }
    if (!resp.ok) {
        throw new Error(`buildhost delete failed: ${resp.status} ${await resp.text()}`);
    }
    console.log("Preview removed");
}
main().catch((err) => {
    console.error(err);
    process.exit(1);
});
