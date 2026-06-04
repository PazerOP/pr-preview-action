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
const fs = __importStar(require("fs"));
const buildhost_1 = require("./buildhost");
function env(name) {
    return process.env[name] || "";
}
/**
 * Derive the buildhost project name from the repository. buildhost's OIDC
 * auto-provisioning names a project after the repo (the part after the owner),
 * lowercased, so we mirror that here.
 */
function deriveProject(repository) {
    const repo = repository.split("/").pop() || repository;
    return repo.toLowerCase();
}
function refToBranch() {
    const refName = env("GITHUB_REF_NAME");
    if (refName)
        return refName;
    const ref = env("GITHUB_REF");
    return ref.replace(/^refs\/heads\//, "").replace(/^refs\/tags\//, "");
}
function determineAutoAction(eventName, eventPath) {
    if (eventName === "push") {
        const event = JSON.parse(fs.readFileSync(eventPath, "utf8"));
        const defaultBranch = event.repository?.default_branch;
        const ref = env("GITHUB_REF");
        if (defaultBranch && ref === `refs/heads/${defaultBranch}`) {
            return "deploy";
        }
        console.error(`Push to non-default branch (${ref}), skipping`);
        return "none";
    }
    if (eventName !== "pull_request" && eventName !== "pull_request_target") {
        console.error(`unknown event ${eventName}; no action to take`);
        return "none";
    }
    const event = JSON.parse(fs.readFileSync(eventPath, "utf8"));
    const action = event.action;
    console.error(`event_type is ${action}`);
    switch (action) {
        case "opened":
        case "reopened":
        case "synchronize":
            return "deploy";
        case "closed":
            return "remove";
        default:
            console.error(`event type ${action}; no action to take`);
            return "none";
    }
}
function appendToFile(filePath, content) {
    fs.appendFileSync(filePath, content);
}
function writeEnvAndOutput(vars, envFile, outputFile) {
    const lines = Object.entries(vars)
        .map(([k, v]) => `${k}=${v}`)
        .join("\n");
    appendToFile(envFile, lines + "\n");
    appendToFile(outputFile, lines + "\n");
}
// Main
const inputAction = env("INPUT_ACTION") || "auto";
const serverInput = env("INPUT_BUILDHOST_SERVER") || "https://pazer.build";
const projectInput = env("INPUT_PROJECT");
const prNumber = env("INPUT_PR_NUMBER");
const actionRef = env("INPUT_ACTION_REF") || "unknown";
const eventName = env("GITHUB_EVENT_NAME");
const eventPath = env("GITHUB_EVENT_PATH");
const repository = env("GITHUB_REPOSITORY");
const envFile = env("GITHUB_ENV");
const outputFile = env("GITHUB_OUTPUT");
const server = serverInput.replace(/\/+$/, "");
const project = projectInput || deriveProject(repository);
const isPrEvent = eventName === "pull_request" || eventName === "pull_request_target";
// Each PR gets its own buildhost site branch (pr-<number>); a push deploys
// under the pushed git branch name. Both map directly onto buildhost's
// first-class per-branch site deployments.
const siteBranch = isPrEvent ? `pr-${prNumber}` : refToBranch();
let deploymentAction = inputAction;
if (deploymentAction === "auto") {
    console.error("Determining auto action");
    deploymentAction = determineAutoAction(eventName, eventPath);
    console.error(`Auto action is ${deploymentAction}`);
}
const basePreviewUrl = `${(0, buildhost_1.siteUrl)(server, project, siteBranch)}/`;
// Short SHA for cache busting / display.
let shortSha = "";
try {
    const event = JSON.parse(fs.readFileSync(eventPath, "utf8"));
    const headSha = event.pull_request?.head?.sha || env("GITHUB_SHA") || "";
    shortSha = headSha.slice(0, 7);
}
catch {
    shortSha = (env("GITHUB_SHA") || "").slice(0, 7);
}
const previewUrl = shortSha
    ? `${basePreviewUrl}?v=${shortSha}`
    : basePreviewUrl;
const actionStartTimestamp = Math.floor(Date.now() / 1000).toString();
const actionStartTime = new Date()
    .toISOString()
    .replace("T", " ")
    .replace(/\.\d+Z$/, " UTC");
// Write to both GITHUB_ENV (so later steps can read them) and GITHUB_OUTPUT.
const sharedVars = {
    deployment_action: deploymentAction,
    buildhost_server: server,
    buildhost_project: project,
    site_branch: siteBranch,
    preview_base_url: basePreviewUrl,
    preview_url: previewUrl,
    short_sha: shortSha,
    action_version: actionRef,
    action_start_time: actionStartTime,
    action_start_timestamp: actionStartTimestamp,
};
writeEnvAndOutput(sharedVars, envFile, outputFile);
console.log(`Action: ${deploymentAction}`);
console.log(`Project: ${project}`);
console.log(`Site branch: ${siteBranch}`);
console.log(`Preview URL: ${previewUrl}`);
