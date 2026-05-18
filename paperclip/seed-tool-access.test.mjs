import assert from 'node:assert/strict';
import { test } from 'node:test';
import { seedToolAccessForCompany } from './seed-tool-access.mjs';

test('seeds company tools, presets, and applies the default preset idempotently', async () => {
  const state = {
    tools: [],
    presets: [],
    grants: [],
    agents: [
      { id: 'agent-1', adapterType: 'hermes_local', status: 'active' },
      { id: 'agent-2', adapterType: 'claude_local', status: 'active' },
    ],
    applyCalls: [],
  };

  const api = async (method, path, body) => {
    if (method === 'GET' && path === '/api/companies/company-1/tools') {
      return { tools: state.tools, grants: state.grants };
    }
    if (method === 'POST' && path === '/api/companies/company-1/tools') {
      const created = { id: `tool-${state.tools.length + 1}`, companyId: 'company-1', ...body };
      state.tools.push(created);
      return created;
    }
    if (method === 'GET' && path === '/api/companies/company-1/tool-presets') {
      return state.presets;
    }
    if (method === 'POST' && path === '/api/companies/company-1/tool-presets') {
      const created = { id: `preset-${state.presets.length + 1}`, companyId: 'company-1', ...body };
      state.presets.push(created);
      return created;
    }
    if (method === 'GET' && path === '/api/companies/company-1/agents') {
      return state.agents;
    }
    if (method === 'POST' && path === '/api/companies/company-1/tool-presets/apply') {
      state.applyCalls.push(body);
      const preset = state.presets.find((row) => row.id === body.presetId);
      for (const presetGrant of preset.grants) {
        const tool = state.tools.find((row) => row.key === presetGrant.toolKey);
        if (!tool) continue;
        const existing = state.grants.find((grant) => grant.agentId === body.agentId && grant.toolId === tool.id);
        if (existing) {
          existing.mode = presetGrant.mode;
        } else {
          state.grants.push({
            id: `grant-${state.grants.length + 1}`,
            agentId: body.agentId,
            toolId: tool.id,
            mode: presetGrant.mode,
          });
        }
      }
      return { grants: state.grants };
    }
    throw new Error(`Unexpected API call: ${method} ${path}`);
  };

  const first = await seedToolAccessForCompany({ api, companyId: 'company-1' });
  assert.equal(first.createdTools, 11);
  assert.equal(first.createdPresets, 3);
  assert.equal(first.appliedPresets, 1);
  assert.equal(state.applyCalls.length, 1);
  assert.equal(state.applyCalls[0].agentId, 'agent-1');

  const second = await seedToolAccessForCompany({ api, companyId: 'company-1' });
  assert.equal(second.createdTools, 0);
  assert.equal(second.createdPresets, 0);
  assert.equal(second.appliedPresets, 0);
  assert.equal(state.applyCalls.length, 1);
});

test('skips gracefully when the Paperclip build has no tool access API', async () => {
  const logs = [];
  const summary = await seedToolAccessForCompany({
    companyId: 'company-1',
    log: (line) => logs.push(line),
    api: async () => {
      throw new Error('GET /api/companies/company-1/tools failed with 404: not found');
    },
  });

  assert.equal(summary.skipped, true);
  assert.match(logs[0], /tool access API unavailable/);
});
