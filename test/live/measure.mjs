#!/usr/bin/env node
// Measure every n8n node operation against the live layer: status, latency p50/p95, body size, and which top-level
// fields come back null / empty / missing against what the OpenAPI document declares.
//   TAIFOON_PROBE_KEY=… node test/live/measure.mjs [--runs 5] [--json out.json] [--md out.md]
import { createRequire } from 'node:module';
import { writeFileSync } from 'node:fs';
const require = createRequire(import.meta.url);
const { operations } = require('./node-request.js');
const { SPEC } = require('./ops.spec.js');
const { BASE, sampleIds, callOp } = require('./harness.js');

const arg = (n, d) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : d; };
const RUNS = Number(arg('--runs', 5));
const pct = (xs, p) => { const s = [...xs].filter(Number.isFinite).sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.ceil((p / 100) * s.length) - 1)] : NaN; };
const oa = await (await fetch(`${BASE}/openapi.json`)).json();
const declared = (method, url) => {
	const p = '/v1' + url.replace(/^=/, '').replace(/\{\{\s*\$parameter(?:\.(\w+)|\["(\w+)"\])\s*\}\}/g, '{x}');
	for (const [k, ms] of Object.entries(oa.paths)) if (k.replace(/\{[^}]+\}/g, '{x}') === p && ms[method.toLowerCase()]) return ms[method.toLowerCase()];
	return null;
};
const shape = (j) => {
	if (!j || typeof j !== 'object' || Array.isArray(j)) return { keys: [], nulls: [], empty: [] };
	const keys = Object.keys(j);
	return { keys, nulls: keys.filter((k) => j[k] === null), empty: keys.filter((k) => (Array.isArray(j[k]) && j[k].length === 0) || j[k] === '' || (j[k] && typeof j[k] === 'object' && !Array.isArray(j[k]) && Object.keys(j[k]).length === 0)) };
};

const ids = await sampleIds();
const rows = [];
for (const op of operations()) {
	const id = `${op.resource}.${op.operation}`;
	const s = SPEC[id];
	if (!s) { rows.push({ id, method: op.method, url: op.url, missingSpec: true }); continue; }
	const live = s.mode !== 'refusal-only';
	const params = live ? s.params(ids) : (s.refusals[0]?.params ?? s.params(ids));
	const as = live ? 'ok' : s.refusals[0]?.noKey ? 'noKey' : s.refusals[0]?.badKey ? 'badKey' : 'ok';
	const calls = [];
	for (let i = 0; i < (live ? RUNS : 2); i++) calls.push(await callOp(op.resource, op.operation, params, { key: s.key, as }));
	const last = calls[calls.length - 1];
	const d = declared(op.method, op.url);
	const sch = d?.responses?.['200']?.content?.['application/json']?.schema ?? d?.responses?.['201']?.content?.['application/json']?.schema ?? null;
	const sh = shape(last.json);
	const refusals = [];
	for (const rf of s.refusals) {
		const r = await callOp(op.resource, op.operation, rf.params ?? s.params(ids), { key: s.key, as: rf.noKey ? 'noKey' : rf.badKey ? 'badKey' : 'ok' });
		refusals.push({ why: rf.why, want: rf.status, got: r.status, code: r.json?.code ?? null, hasError: Boolean(r.json && (r.json.error || r.json.message)), hasNext: Boolean(r.json?.next_step), type: r.type });
	}
	rows.push({
		id, method: op.method, url: op.url, mode: s.mode, live, statuses: [...new Set(calls.map((c) => c.status))],
		p50: Math.round(pct(calls.map((c) => c.ms), 50)), p95: Math.round(pct(calls.map((c) => c.ms), 95)), bytes: last.bytes, type: last.type,
		keys: sh.keys, nulls: sh.nulls, empty: sh.empty,
		declared: sch ? { required: sch.required ?? [], props: Object.keys(sch.properties ?? {}) } : null,
		undeclared: sch?.properties ? sh.keys.filter((k) => !(k in sch.properties)) : null,
		missingRequired: (sch?.required ?? []).filter((k) => !sh.keys.includes(k)),
		refusals, body: last.status >= 400 || !live ? (last.text ?? '').slice(0, 300) : undefined,
	});
	process.stderr.write(`${id} ${rows.at(-1).statuses} p95=${rows.at(-1).p95}ms\n`);
}
const out = arg('--json');
if (out) writeFileSync(out, JSON.stringify({ at: new Date().toISOString(), base: BASE, runs: RUNS, rows }, null, 1));
const md = arg('--md');
if (md) {
	const e = (x) => String(x ?? '').replace(/\|/g, '\\|');
	const nullCell = (r) => !r.live ? '—' : r.nulls.length ? r.nulls.map((k) => `${k}${r.declared?.props?.includes(k) ? '' : ' (undeclared)'}`).join(', ') : 'none';
	const t = [`Measured ${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC against ${BASE}, ${RUNS} calls per live operation, each exactly the request the node builds.`, '',
		'| operation | request | mode | status | p50 ms | p95 ms | budget ms | bytes | null fields | empty lists | refusals (want → got, code) |', '|---|---|---|---|---|---|---|---|---|---|---|'];
	for (const r of rows) {
		const s = SPEC[r.id];
		const ref = r.refusals.map((x) => `${x.why}: ${x.want.join('/')} → ${x.got} ${x.code ?? '(no code)'}${x.want.includes(x.got) ? '' : ' **MISMATCH**'}`).join('<br>');
		t.push(`| ${r.id} | \`${r.method} /v1${e(String(r.url).replace(/^=/, '').replace(/\{\{\s*\$parameter(?:\.(\w+)|\["(\w+)"\])\s*\}\}/g, (_, a, b) => `{${a ?? b}}`))}\` | ${r.mode} | ${r.statuses.join(', ')} | ${r.live ? r.p50 : '—'} | ${r.live ? r.p95 : '—'} | ${s.budgetMs} | ${r.live ? r.bytes : '—'} | ${e(nullCell(r))} | ${r.live ? e(r.empty.join(', ') || 'none') : '—'} | ${e(ref) || '—'} |`);
	}
	writeFileSync(md, t.join('\n') + '\n');
}
if (!out && !md) console.log(JSON.stringify(rows, null, 1));
