import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

test('pull request image builds include arm64 for local Coolify previews', async () => {
  const workflow = await readFile('.github/workflows/build-image.yml', 'utf8');

  assert.match(workflow, /pull_request:/);
  assert.match(workflow, /IMAGE_PLATFORMS=linux\/amd64,linux\/arm64/);
  assert.match(workflow, /docker\/setup-qemu-action@v4[\s\S]*platforms: arm64/);
  assert.doesNotMatch(workflow, /setup-qemu-action@v4[\s\S]*if: github\.event_name != 'pull_request'/);
});

test('workflow and compose defaults publish and pull the template-agent image package', async () => {
  const workflow = await readFile('.github/workflows/build-image.yml', 'utf8');
  const compose = await readFile('compose.yaml', 'utf8');

  assert.match(workflow, /IMAGE_NAME: leebaroneau\/template-agent/);
  assert.doesNotMatch(workflow, /leebaroneau\/paperclip-hermes-gbrain/);
  assert.match(compose, /ghcr\.io\/leebaroneau\/template-agent:latest/);
  assert.doesNotMatch(compose, /ghcr\.io\/leebaroneau\/paperclip-hermes-gbrain:latest/);
});
