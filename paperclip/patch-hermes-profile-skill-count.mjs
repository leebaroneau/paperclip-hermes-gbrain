#!/usr/bin/env node

import { readFile, writeFile } from 'node:fs/promises';

const DEFAULT_HERMES_PROFILES_PATH =
  '/usr/local/lib/hermes-agent/hermes_cli/profiles.py';

// Hermes' `hermes_cli/profiles.py:_count_skills` walks a profile's skills/
// directory with `Path.rglob`, which does NOT descend into symlinked
// directories. template-agent seeds skill bundles as symlinks (see
// hermes-runtime/scripts/bootstrap-profiles.sh), so the stock count
// under-reports every symlinked bundle.
//
// Hermes already ships a symlink-aware walker — `iter_skill_index_files`
// in `agent.skill_utils` (uses `os.walk(..., followlinks=True)`) — and
// `profiles.py` already imports from that module. So the fix is to reuse the
// upstream helper rather than re-implement a walker: extend, don't re-code.
//
// This patch is intentionally tied to the v0.15+ shape of `_count_skills`
// (which filters via `is_excluded_skill_path`). If Hermes changes that body
// again, the needles below will be absent and we hard-fail loudly rather than
// silently no-op, so the drift surfaces in the image build / entrypoint.

const PATCH_MARKER = 'iter_skill_index_files(skills_dir, "SKILL.md")';

const IMPORT_NEEDLE = 'from agent.skill_utils import is_excluded_skill_path';
const IMPORT_REPLACEMENT =
  'from agent.skill_utils import is_excluded_skill_path, iter_skill_index_files';

const LOOP_NEEDLE = '    for md in skills_dir.rglob("SKILL.md"):';
const LOOP_REPLACEMENT = '    for md in iter_skill_index_files(skills_dir, "SKILL.md"):';

export function patchHermesProfilesSource(source) {
  // Idempotent: already pointed at the symlink-aware walker (by us or upstream).
  if (source.includes(PATCH_MARKER)) {
    return source;
  }

  if (!source.includes(IMPORT_NEEDLE) || !source.includes(LOOP_NEEDLE)) {
    throw new Error(
      '[template-agent] patch-hermes-profile-skill-count: expected needles not found in ' +
        'hermes_cli/profiles.py — _count_skills changed upstream. Re-audit this patch against ' +
        'the current Hermes release before bumping HERMES_AGENT_REF.',
    );
  }

  return source
    .replace(IMPORT_NEEDLE, IMPORT_REPLACEMENT)
    .replace(LOOP_NEEDLE, LOOP_REPLACEMENT);
}

export async function patchHermesProfilesFile(
  filePath = process.env.HERMES_PROFILES_PATH || DEFAULT_HERMES_PROFILES_PATH,
) {
  const source = await readFile(filePath, 'utf8');
  const patched = patchHermesProfilesSource(source);
  if (patched === source) {
    console.log('[template-agent] Hermes profile skill count patch already applied');
    return { changed: false, filePath };
  }

  await writeFile(filePath, patched);
  console.log('[template-agent] Applied Hermes profile skill count patch');
  return { changed: true, filePath };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await patchHermesProfilesFile();
}
