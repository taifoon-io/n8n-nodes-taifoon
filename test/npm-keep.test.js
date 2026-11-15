// _NPM_KEEP_LIVE_v1_: the keep-live probe of the publish workflow publishes a release again only when npm never had it.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');

const load = () => import('../scripts/npm-keep.mjs');
const pkg = (versions, extra = {}) => ({ name: 'n8n-nodes-taifoon', 'dist-tags': { latest: versions.at(-1) }, versions: Object.fromEntries(versions.map((v) => [v, { version: v }])),
	time: Object.fromEntries(versions.map((v) => [v, '2026-11-15T00:40:15.085Z'])), ...extra });

test('a release npm has is present: nothing is published', async () => {
	const { keepOf } = await load();
	const k = keepOf(200, pkg(['2.0.1', '2.1.0']), 'v2.1.0');
	assert.equal(k.state, 'present'); assert.match(k.why, /npm has 2\.1\.0/);
});

test('a release npm never had is published again (a failed publish run)', async () => {
	const { keepOf } = await load();
	const k = keepOf(200, pkg(['2.0.1']), 'v2.1.0');
	assert.deepEqual([k.state, k.tag, k.version], ['publish', 'v2.1.0', '2.1.0']);
});

test('a package npm never had is published', async () => {
	const { keepOf } = await load();
	assert.equal(keepOf(404, { error: 'Not found' }, 'v2.1.0').state, 'publish');
});

test('an unpublished version is never retried: npm does not reuse it', async () => {
	const { keepOf } = await load();
	const b = pkg(['2.0.1']); b.time['2.1.0'] = '2026-11-15T00:40:15.085Z';
	assert.equal(keepOf(200, b, 'v2.1.0').state, 'gone');
	assert.equal(keepOf(404, { time: { unpublished: { time: '2026-11-15T00:00:00Z' } } }, 'v2.1.0').state, 'gone');
	assert.equal(keepOf(200, { time: { unpublished: { time: '2026-11-15T00:00:00Z' } } }, 'v2.1.0').state, 'gone');
});

test('no answer from npm or no release tag publishes nothing', async () => {
	const { keepOf } = await load();
	for (const s of [0, 429, 500, 503]) assert.equal(keepOf(s, null, 'v2.1.0').state, 'unread');
	for (const t of ['', null, 'latest', '2.1.0', 'v2.1']) assert.equal(keepOf(200, pkg(['2.1.0']), t).state, 'unread');
});

test('the publish workflow runs the probe hourly and publishes only its tag', () => {
	const y = readFileSync(join(__dirname, '..', '.github', 'workflows', 'publish.yml'), 'utf8');
	assert.match(y, /schedule:\s*\n\s*- cron: '[^']+'/);
	assert.match(y, /workflow_dispatch:/);
	assert.match(y, /node scripts\/npm-keep\.mjs/);
	assert.match(y, /needs\.probe\.outputs\.tag/);
	// the version check and the publish read the one tag: the release's, or the probe's
	assert.match(y, /test "v\$\(node -p "require\('\.\/package\.json'\)\.version"\)" = "\$TAG"/);
	assert.match(y, /npm publish --provenance --access public/);
});
