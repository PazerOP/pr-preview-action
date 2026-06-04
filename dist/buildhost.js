"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.fetchOidcToken = fetchOidcToken;
exports.resolveToken = resolveToken;
exports.serviceBaseUrl = serviceBaseUrl;
exports.siteUrl = siteUrl;
function env(name) {
    return process.env[name] || "";
}
/**
 * Fetch a GitHub Actions OIDC token for the given audience.
 *
 * Uses the ACTIONS_ID_TOKEN_REQUEST_URL / ACTIONS_ID_TOKEN_REQUEST_TOKEN env
 * vars that GitHub injects into a job that has `id-token: write` permission.
 * buildhost trusts GitHub Actions OIDC tokens directly and auto-provisions a
 * project from the token's subject claim, so no static token is required.
 */
async function fetchOidcToken(audience) {
    const reqUrl = env("ACTIONS_ID_TOKEN_REQUEST_URL");
    const reqToken = env("ACTIONS_ID_TOKEN_REQUEST_TOKEN");
    if (!reqUrl || !reqToken) {
        throw new Error("No buildhost token was provided and OIDC is unavailable. " +
            "Grant 'id-token: write' permission to the calling workflow, " +
            "or provide a BUILDHOST_TOKEN secret.");
    }
    const resp = await fetch(`${reqUrl}&audience=${encodeURIComponent(audience)}`, { headers: { Authorization: `Bearer ${reqToken}` } });
    if (!resp.ok) {
        throw new Error(`OIDC token request failed: ${resp.status} ${await resp.text()}`);
    }
    const data = (await resp.json());
    if (!data.value) {
        throw new Error("OIDC token response did not contain a token value");
    }
    return data.value;
}
/**
 * Resolve a buildhost auth token: prefer an explicit token, otherwise mint a
 * short-lived OIDC token scoped to the buildhost server (audience).
 */
async function resolveToken(explicitToken, audience) {
    if (explicitToken)
        return explicitToken;
    return fetchOidcToken(audience);
}
/**
 * Derive a buildhost service's base URL from the server's base URL by
 * prepending the service subdomain. buildhost serves every service on its own
 * subdomain (`sites.{domain}`, `dl.{domain}`, ...) and dispatches by the first
 * Host label, so `https://pazer.build` + `sites` -> `https://sites.pazer.build`.
 * This mirrors the server's own `auth.DeriveServiceURL`.
 */
function serviceBaseUrl(server, service) {
    const u = new URL(server);
    u.host = `${service}.${u.host}`;
    return u.origin;
}
/**
 * Build the buildhost sites endpoint for a project/branch. This is the upload
 * (PUT) and delete (DELETE) target; appending a trailing slash yields the
 * browsable preview URL (`https://sites.{domain}/{project}/branch/{branch}/`).
 */
function siteUrl(server, project, branch) {
    return `${serviceBaseUrl(server, "sites")}/${project}/branch/${branch}`;
}
