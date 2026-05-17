#!/usr/bin/env node
/**
 * One-shot tool: revoke historical canAssignTasks grants from agents that
 * have access.taskAssignSource === 'explicit_grant' but no direct reports.
 *
 * Steady-state profile-sync (since PR #11) tracks grants it issues in
 * manifest.permissionedAgents and revokes when an agent loses qualification.
 * Agents granted BEFORE that tracking shipped (or via the Paperclip UI / a
 * direct API call) aren't in the manifest, so the steady-state revoke
 * doesn't touch them. This script handles that cleanup as a one-time
 * operation.
 *
 * Usage:
 *   PAPERCLIP_API_KEY=pcp_board_... \
 *     node paperclip/narrow-grants.mjs                # dry-run, default
 *   PAPERCLIP_API_KEY=... node paperclip/narrow-grants.mjs --apply
 *
 * Respects PAPERCLIP_API_BASE, PAPERCLIP_COMPANY_IDS, PAPERCLIP_COMPANIES
 * same as profile-sync.
 */

import { pathToFileURL } from 'node:url';
import {
  countDirectReports,
  isRetiredAgent,
  revokeManagerAssignmentPermissions,
} from './profile-sync.mjs';

const DEFAULT_API_BASE = 'http://127.0.0.1:3100';

export async function narrowGrants({
  api,
  companies,
  listAgents,
  getAgent,
  patchAgentPermissions,
  apply = false,
}) {
  const summary = {
    scanned: 0,
    candidates: 0,
    revoked: 0,
    skippedDryRun: 0,
    findings: [],
  };

  for (const company of companies) {
    const agents = await listAgents(company.id);
    const activeAgents = agents.filter((agent) => !isRetiredAgent(agent));
    const directReportCounts = countDirectReports(activeAgents);

    for (const slim of activeAgents) {
      summary.scanned += 1;
      // List endpoint doesn't expose access; fetch the full agent.
      const full = await getAgent(slim.id);
      const access = full?.access || {};
      const hasExplicitGrant = access.canAssignTasks === true
        && access.taskAssignSource === 'explicit_grant';
      if (!hasExplicitGrant) continue;

      const directReportCount = directReportCounts.get(full.id) || 0;
      if (directReportCount > 0) continue;

      summary.candidates += 1;
      summary.findings.push({
        companyId: company.id,
        companyName: company.name || company.id,
        agentId: full.id,
        agentName: full.name,
        role: full.role,
        reason: 'explicit_grant + no direct reports',
      });

      if (!apply) {
        summary.skippedDryRun += 1;
        continue;
      }

      const payload = revokeManagerAssignmentPermissions(full);
      await patchAgentPermissions(full.id, payload);
      summary.revoked += 1;
    }
  }

  return summary;
}

// ── CLI plumbing ──────────────────────────────────────────────────────────

function envValue(key, fallback) {
  const value = process.env[key]?.trim();
  return value || fallback;
}

function parseConfiguredCompanies(value) {
  if (!value) return [];
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => {
      const [id, ...nameParts] = item.split(':');
      const name = nameParts.join(':').trim();
      return { id: id.trim(), name: name || id.trim() };
    });
}

function extractArray(response) {
  if (Array.isArray(response)) return response;
  if (Array.isArray(response?.companies)) return response.companies;
  if (Array.isArray(response?.agents)) return response.agents;
  if (Array.isArray(response?.data)) return response.data;
  return [];
}

function withoutApiSuffix(url) {
  return url.replace(/\/+$/, '').replace(/\/api$/, '');
}

async function makeApiClient({ apiBase, apiKey }) {
  const serverUrl = withoutApiSuffix(apiBase);
  return async function api(method, path, body) {
    const response = await fetch(`${serverUrl}${path}`, {
      method,
      headers: {
        authorization: `Bearer ${apiKey}`,
        accept: 'application/json',
        'content-type': 'application/json',
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`${method} ${path} failed with ${response.status}: ${text}`);
    }
    if (response.status === 204) return null;
    return await response.json();
  };
}

async function resolveCompanies({ api, companyIds, configuredCompanies }) {
  if (configuredCompanies.length > 0) return configuredCompanies;

  if (companyIds.length > 0) {
    return await Promise.all(companyIds.map(async (id) => {
      const company = await api('GET', `/api/companies/${id}`);
      return {
        id: company.id || id,
        name: company.name || company.shortName || company.slug || id,
      };
    }));
  }

  return extractArray(await api('GET', '/api/companies')).map((company) => ({
    id: company.id,
    name: company.name || company.shortName || company.slug || company.id,
  })).filter((company) => company.id);
}

async function main() {
  const apply = process.argv.includes('--apply');

  const apiKey = envValue('PAPERCLIP_PROFILE_SYNC_API_KEY') || envValue('PAPERCLIP_API_KEY');
  if (!apiKey) {
    throw new Error('PAPERCLIP_PROFILE_SYNC_API_KEY or PAPERCLIP_API_KEY is required');
  }

  const api = await makeApiClient({
    apiBase: envValue('PAPERCLIP_API_BASE', DEFAULT_API_BASE),
    apiKey,
  });

  const configuredCompanies = parseConfiguredCompanies(envValue('PAPERCLIP_COMPANIES'));
  const companyIds = (envValue('PAPERCLIP_COMPANY_IDS') || '')
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean);
  const companies = await resolveCompanies({ api, companyIds, configuredCompanies });

  const summary = await narrowGrants({
    api,
    companies,
    listAgents: async (companyId) => extractArray(await api('GET', `/api/companies/${companyId}/agents`)),
    getAgent: async (agentId) => await api('GET', `/api/agents/${agentId}`),
    patchAgentPermissions: async (agentId, payload) => await api('PATCH', `/api/agents/${agentId}/permissions`, payload),
    apply,
  });

  const mode = apply ? 'APPLY' : 'DRY-RUN (pass --apply to actually patch)';
  console.log(`narrow-grants ${mode}`);
  console.log(JSON.stringify({
    scanned: summary.scanned,
    candidates: summary.candidates,
    revoked: summary.revoked,
    skippedDryRun: summary.skippedDryRun,
  }));
  if (summary.findings.length > 0) {
    console.log('---');
    for (const f of summary.findings) {
      console.log(`  ${f.companyName} :: ${f.agentName} (${f.role}) — ${f.reason}`);
    }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error.stack || error.message);
    process.exit(1);
  });
}
