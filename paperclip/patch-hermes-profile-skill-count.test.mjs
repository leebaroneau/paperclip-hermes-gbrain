import { test } from 'node:test';
import assert from 'node:assert/strict';

import { patchHermesProfilesSource } from './patch-hermes-profile-skill-count.mjs';

// Mirrors the v0.15+ shape of hermes_cli/profiles.py: imports the exclusion
// helper from agent.skill_utils and counts via skills_dir.rglob("SKILL.md").
const PROFILES_SOURCE = `from pathlib import Path

from agent.skill_utils import is_excluded_skill_path


def _count_skills(profile_dir: Path) -> int:
    """Count installed skills in a profile."""
    skills_dir = profile_dir / "skills"
    if not skills_dir.is_dir():
        return 0
    count = 0
    for md in skills_dir.rglob("SKILL.md"):
        if is_excluded_skill_path(md):
            continue
        count += 1
    return count
`;

test('patchHermesProfilesSource repoints _count_skills at the symlink-aware upstream walker', () => {
  const patched = patchHermesProfilesSource(PROFILES_SOURCE);
  // reuses Hermes' own helper instead of rglob (which skips symlinked bundles)
  assert.match(patched, /for md in iter_skill_index_files\(skills_dir, "SKILL\.md"\):/);
  assert.doesNotMatch(patched, /skills_dir\.rglob\("SKILL\.md"\)/);
  // imports the helper alongside the existing exclusion import
  assert.match(
    patched,
    /from agent\.skill_utils import is_excluded_skill_path, iter_skill_index_files/,
  );
});

test('patchHermesProfilesSource is idempotent', () => {
  const once = patchHermesProfilesSource(PROFILES_SOURCE);
  const twice = patchHermesProfilesSource(once);
  assert.equal(twice, once);
});

test('patchHermesProfilesSource hard-fails when the upstream needle is absent', () => {
  const drifted = `from pathlib import Path


def _count_skills(profile_dir: Path) -> int:
    return len(list((profile_dir / "skills").glob("*/SKILL.md")))
`;
  assert.throws(() => patchHermesProfilesSource(drifted), /expected needles not found/);
});
