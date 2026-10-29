// _N8N_CONTRACTS_INLINE_v1_: the operations coord's language names are generated (scripts/gen-descriptions.mjs from
// coord-lang/n8n-resale.json, coord gen row n8n-resale-node); a generated file edited by hand, or a hand-typed op whose method or
// url left its gate route, fails here. Offline; skipped where coord-lang/ is not shipped (the public mirror).
const test = require('node:test');
const assert = require('node:assert/strict');
const { existsSync, readFileSync } = require('node:fs');
const { join } = require('node:path');

const SRC = join(__dirname, '..', 'coord-lang', 'n8n-resale.json');
const DESC = join(__dirname, '..', 'nodes', 'Taifoon', 'descriptions');

test('the generated descriptions are what coord-lang/n8n-resale.json emits, and every hand-typed op keeps its route', { skip: !existsSync(SRC) && 'no coord-lang/ here' }, async () => {
	const { generate, handDrift } = await import('../scripts/gen-descriptions.mjs');
	const src = JSON.parse(readFileSync(SRC, 'utf8'));
	for (const [file, body] of generate(src)) assert.equal(readFileSync(join(DESC, file), 'utf8'), body, `${file} drifted: run npm run gen`);
	assert.deepEqual(handDrift(src), []);
});

test('the generated ops are shipped by the node, with the method and url coord names', { skip: !existsSync(SRC) && 'no coord-lang/ here' }, () => {
	const { Taifoon } = require('../dist/nodes/Taifoon/Taifoon.node.js');
	const d = new Taifoon().description;
	const src = JSON.parse(readFileSync(SRC, 'utf8'));
	for (const o of src.node_ops) {
		const sel = d.properties.find((p) => p.name === 'operation' && p.displayOptions?.show?.resource?.[0] === o.resource);
		assert.ok(sel, `resource ${o.resource} is shipped`);
		const opt = sel.options.find((x) => x.value === o.operation);
		assert.ok(opt, `${o.resource}.${o.operation} is shipped`);
		assert.deepEqual(opt.routing.request, { method: o.method, url: o.url }, `${o.resource}.${o.operation} → ${o.method} /v1/${o.op}`);
	}
});
