import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

/**
 * Documentation may describe the release being prepared before its tag exists, and several pages do:
 * the migration guide and the runbooks tell an operator what changes "from 0.23.6" while
 * `package.json` still carries the version before it. Nothing bound the two, so a version named in
 * prose was only ever checked by someone reading it, and a typo, or a page left behind when the
 * release number changed, would ship pointing operators at a version that never existed.
 *
 * The rule this pins is the narrow one that is always true:
 *
 *  - a version OLDER than or equal to the package version is history and is not this spec's business;
 *  - a version NEWER than it is a forward reference to the release being prepared, so there may be
 *    exactly ONE of them, and the changelog must still be open (`[Unreleased]`) for it to make sense.
 *
 * So the day the tag is cut, bumping `package.json` is enough: the references become history and this
 * spec falls silent. What it catches is the pair going out of step.
 */
const ROOT = join(__dirname, '..', '..');
const SEMVER = /\b(\d+)\.(\d+)\.(\d+)\b/g;

function packageVersion(): [number, number, number] {
  const raw = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as { version: string };
  const parts = raw.version.split('.').map(Number);
  return [parts[0], parts[1], parts[2]];
}

function isNewer(a: [number, number, number], b: [number, number, number]): boolean {
  if (a[0] !== b[0]) return a[0] > b[0];
  if (a[1] !== b[1]) return a[1] > b[1];
  return a[2] > b[2];
}

/** Every doc file plus the changelog: the prose an operator reads, not the code. */
function docFiles(): string[] {
  const docsDir = join(ROOT, 'docs');
  const docs = readdirSync(docsDir)
    .filter(name => name.endsWith('.md'))
    .map(name => join(docsDir, name));
  return [...docs, join(ROOT, 'CHANGELOG.md'), join(ROOT, 'README.md')];
}

describe('a version named in the docs before its tag exists', () => {
  it('is the same one everywhere, and only while the changelog is still open', () => {
    const current = packageVersion();
    const changelog = readFileSync(join(ROOT, 'CHANGELOG.md'), 'utf8');

    const ahead = new Map<string, string[]>();
    for (const file of docFiles()) {
      const text = readFileSync(file, 'utf8');
      // The changelog's own released headings are the history it exists to record, not forward
      // references, so they are read from the body below rather than matched here.
      const body = file.endsWith('CHANGELOG.md') ? text.split(/^## \[\d/m)[0] : text;
      for (const match of body.matchAll(SEMVER)) {
        const version: [number, number, number] = [Number(match[1]), Number(match[2]), Number(match[3])];
        // Only this project's own version line. The docs name plenty of third-party versions, and
        // some of them sort above ours; a gate that argued about a dependency bump would be noise.
        // A forward reference to OpenWA is by construction the current minor or the next one.
        if (version[0] !== current[0]) continue;
        if (version[1] !== current[1] && version[1] !== current[1] + 1) continue;
        if (!isNewer(version, current)) continue;
        const key = match[0];
        ahead.set(key, [...(ahead.get(key) ?? []), file.replace(ROOT + '/', '')]);
      }
    }

    const named = [...ahead.keys()].sort();
    expect(named.length).toBeLessThanOrEqual(1);

    if (named.length === 1) {
      // A forward reference only makes sense while the release it names is still being prepared.
      expect(changelog).toContain('## [Unreleased]');
    }
  });
});
