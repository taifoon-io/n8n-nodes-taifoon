#!/usr/bin/env node
// scripts/npm-keep.mjs — _NPM_KEEP_LIVE_v1_ (2026-11-15): the keep-live probe of the published package. The publish workflow runs it
// every hour (and on a dispatch): it reads the npm registry without a key and the newest release tag vX.Y.Z, and says whether that
// release is on npm. Only a release the registry never had is published again (a release whose publish run failed, an npm outage).
// npm never reuses a version once it was unpublished, so a version that was there and is gone needs a new release, never a retry.
//   node scripts/npm-keep.mjs <package> <tag>    prints one JSON line and, under GitHub Actions, writes `tag=` to $GITHUB_OUTPUT
//   (an empty tag: nothing to publish). Exit 0 for present or publish; 3 when the registry did not answer (the run says so, publishes nothing).
import { appendFileSync } from 'node:fs';

/** The keep decision from the registry's answer for the package and the newest release tag. Pure.
 *  { state: present | publish | gone | unread, tag, version, why } — `publish` is the only state that publishes. */
export function keepOf(status, body, tag) {
	const version = /^v(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)$/.exec(String(tag ?? ''))?.[1] ?? null;
	if (!version) return { state: 'unread', tag: null, version: null, why: `no release tag of the form vX.Y.Z (got ${JSON.stringify(tag ?? null)})` };
	if (status === 0 || status === 429 || status >= 500) return { state: 'unread', tag, version, why: `the npm registry answered ${status || 'nothing'}` };
	const time = body && typeof body === 'object' ? (body.time ?? {}) : {};
	if (status === 404 || (status === 200 && !body?.versions)) {
		// a package npm unpublished keeps its time record; its versions can never be published again
		if (time.unpublished || time[version]) return { state: 'gone', tag, version, why: `npm unpublished ${version}; npm never reuses a version, so the next release needs a new version` };
		return { state: 'publish', tag, version, why: `npm has no package yet; ${tag} is published again` };
	}
	if (status !== 200) return { state: 'unread', tag, version, why: `the npm registry answered ${status}` };
	if (body.versions[version]) return { state: 'present', tag, version, why: `npm has ${version} (latest ${body['dist-tags']?.latest ?? 'unset'})` };
	if (time[version]) return { state: 'gone', tag, version, why: `npm had ${version} and it was unpublished; the next release needs a new version` };
	return { state: 'publish', tag, version, why: `npm does not have ${version}; ${tag} is published again` };
}

async function main() {
	const [name, tag] = process.argv.slice(2);
	if (!name) { console.error('usage: npm-keep.mjs <package> <tag>'); process.exit(2); }
	let status = 0; let body = null;
	try {
		const r = await fetch(`https://registry.npmjs.org/${encodeURIComponent(name)}`, { headers: { accept: 'application/json', 'user-agent': 'npm-keep/1' }, signal: AbortSignal.timeout(20_000) });
		status = r.status; body = await r.json().catch(() => null);
	} catch { status = 0; }
	const k = keepOf(status, body, tag);
	console.log(JSON.stringify({ package: name, ...k }));
	if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `tag=${k.state === 'publish' ? k.tag : ''}\nstate=${k.state}\n`);
	process.exitCode = k.state === 'unread' ? 3 : 0;
}
if (import.meta.url === `file://${process.argv[1]}`) await main();
