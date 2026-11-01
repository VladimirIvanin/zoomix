import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const { version } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
assert.equal(process.env.RELEASE_TAG, `v${version}`, `Expected release tag v${version}`);
assert(!version.includes('+'), 'npm versions must not contain build metadata');
assert(!version.includes('-') || process.env.PRERELEASE === 'true', 'Mark this version as a GitHub pre-release');
console.log(`Release v${version} validated`);
