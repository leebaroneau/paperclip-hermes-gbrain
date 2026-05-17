import test from 'node:test';
import assert from 'node:assert/strict';

import { narrowGrants } from './narrow-grants.mjs';

function makeListAgents(perCompany) {
  return async (companyId) => perCompany[companyId] || [];
}

function makeGetAgent(byId) {
  return async (agentId) => {
    const a = byId[agentId];
    if (!a) throw new Error(`unknown agent ${agentId}`);
    return a;
  };
}

test('narrowGrants dry-run identifies explicit_grant + no-reports agents without patching', async () => {
  const calls = [];
  const slim = [
    { id: 'ceo_1', name: 'CEO', role: 'ceo' },
    { id: 'cto_1', name: 'CTO', role: 'cto', reportsTo: 'ceo_1' },
    { id: 'eng_1', name: 'Senior Engineer', role: 'engineer', reportsTo: 'cto_1' },
    { id: 'eng_2', name: 'Junior Engineer', role: 'engineer', reportsTo: 'cto_1' },
  ];
  const full = {
    ceo_1: { ...slim[0], access: { canAssignTasks: true, taskAssignSource: 'ceo_role' } },
    cto_1: { ...slim[1], access: { canAssignTasks: true, taskAssignSource: 'explicit_grant' } },
    eng_1: { ...slim[2], access: { canAssignTasks: true, taskAssignSource: 'explicit_grant' } },
    eng_2: { ...slim[3], access: { canAssignTasks: false, taskAssignSource: null } },
  };

  const summary = await narrowGrants({
    companies: [{ id: 'co_1', name: 'Acme' }],
    listAgents: makeListAgents({ co_1: slim }),
    getAgent: makeGetAgent(full),
    patchAgentPermissions: async (agentId, payload) => {
      calls.push({ agentId, payload });
      return {};
    },
    apply: false,
  });

  // CEO: has canAssignTasks but source=ceo_role → ignored.
  // CTO: has explicit_grant but has 2 direct reports → ignored.
  // eng_1: explicit_grant + 0 reports → candidate.
  // eng_2: no canAssignTasks → ignored.
  assert.equal(summary.scanned, 4);
  assert.equal(summary.candidates, 1);
  assert.equal(summary.revoked, 0, 'dry-run never patches');
  assert.equal(summary.skippedDryRun, 1);
  assert.deepEqual(calls, [], 'no API patches in dry-run');
  assert.equal(summary.findings.length, 1);
  assert.equal(summary.findings[0].agentId, 'eng_1');
  assert.equal(summary.findings[0].reason, 'explicit_grant + no direct reports');
});

test('narrowGrants --apply patches each candidate with canAssignTasks=false (preserves canCreateAgents)', async () => {
  const calls = [];
  const slim = [
    { id: 'cto_1', name: 'CTO', role: 'cto', reportsTo: 'ceo_1', permissions: { canCreateAgents: false } },
    { id: 'eng_1', name: 'Senior Engineer', role: 'engineer', reportsTo: 'cto_1', permissions: { canCreateAgents: false } },
    { id: 'pm_1', name: 'Product Manager', role: 'pm', permissions: { canCreateAgents: true } },
  ];
  const full = {
    cto_1: { ...slim[0], access: { canAssignTasks: true, taskAssignSource: 'explicit_grant' } },
    eng_1: { ...slim[1], access: { canAssignTasks: true, taskAssignSource: 'explicit_grant' } },
    pm_1: { ...slim[2], access: { canAssignTasks: true, taskAssignSource: 'explicit_grant' } },
  };

  const summary = await narrowGrants({
    companies: [{ id: 'co_1', name: 'Acme' }],
    listAgents: makeListAgents({ co_1: slim }),
    getAgent: makeGetAgent(full),
    patchAgentPermissions: async (agentId, payload) => {
      calls.push({ agentId, payload });
      return {};
    },
    apply: true,
  });

  // CTO has 1 direct report (eng_1) so it's kept. eng_1 and pm_1 have 0 reports
  // and explicit_grant — both get revoked.
  assert.equal(summary.scanned, 3);
  assert.equal(summary.candidates, 2);
  assert.equal(summary.revoked, 2);
  assert.equal(summary.skippedDryRun, 0);
  assert.equal(calls.length, 2);

  const engCall = calls.find((c) => c.agentId === 'eng_1');
  const pmCall = calls.find((c) => c.agentId === 'pm_1');
  assert.deepEqual(engCall.payload, { canCreateAgents: false, canAssignTasks: false });
  assert.deepEqual(pmCall.payload, { canCreateAgents: true, canAssignTasks: false });
});

test('narrowGrants skips retired agents and never counts them as candidates', async () => {
  const calls = [];
  const slim = [
    {
      id: 'eng_old',
      name: 'Former Engineer',
      role: 'engineer',
      status: 'terminated',
      permissions: { canCreateAgents: false },
    },
  ];
  const full = {
    eng_old: { ...slim[0], access: { canAssignTasks: true, taskAssignSource: 'explicit_grant' } },
  };

  const summary = await narrowGrants({
    companies: [{ id: 'co_1', name: 'Acme' }],
    listAgents: makeListAgents({ co_1: slim }),
    getAgent: makeGetAgent(full),
    patchAgentPermissions: async (agentId, payload) => {
      calls.push({ agentId, payload });
      return {};
    },
    apply: true,
  });

  assert.equal(summary.scanned, 0, 'retired agent is filtered before scan');
  assert.equal(summary.candidates, 0);
  assert.equal(summary.revoked, 0);
  assert.deepEqual(calls, []);
});
