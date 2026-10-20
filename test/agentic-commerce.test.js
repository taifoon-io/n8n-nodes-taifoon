// The n8n agentic-commerce workflows (workflows/agentic-commerce): what build.mjs writes is what is committed; one key, held by one
// credential; every HTTP step answers in full so the normaliser decides; the normaliser's table is the vendored error contract
// (coord lang/cue/gate-errors.cue); every sub-workflow the main flow calls exists. The live run in a real n8n is the e2e suite of the coordination layer.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { execFileSync } = require('node:child_process');

const DIR = join(__dirname, '..', 'workflows', 'agentic-commerce');
const FILES = ['taifoon-agentic-commerce', 'tf-handshake', 'tf-chat', 'tf-buy', 'tf-sell'];
const load = (f) => JSON.parse(readFileSync(join(DIR, `${f}.json`), 'utf8'));
const ERRORS = JSON.parse(readFileSync(join(DIR, 'gate-errors.json'), 'utf8'));

test('the committed workflows are what build.mjs writes', () => {
  const before = FILES.map((f) => readFileSync(join(DIR, `${f}.json`), 'utf8'));
  execFileSync(process.execPath, [join(DIR, 'build.mjs')]);
  assert.deepEqual(FILES.map((f) => readFileSync(join(DIR, `${f}.json`), 'utf8')), before);
});
test('one key in one credential: every HTTP step uses Header Auth, answers in full, never errors; no key anywhere', () => {
  for (const f of FILES) {
    const w = load(f); const text = JSON.stringify(w);
    assert.doesNotMatch(text, /tfr_[A-Za-z0-9]{6,}/, `${f} holds a key`);
    for (const n of w.nodes.filter((x) => x.type === 'n8n-nodes-base.httpRequest')) {
      assert.equal(n.parameters.genericAuthType, 'httpHeaderAuth', `${f}/${n.name}`);
      assert.deepEqual(Object.keys(n.credentials), ['httpHeaderAuth']); assert.equal(n.credentials.httpHeaderAuth.id, '', 'no credential id baked in');
      assert.equal(n.parameters.options.response.response.neverError, true); assert.equal(n.parameters.options.response.response.fullResponse, true);
    }
  }
});
test('every answer is read by the one normaliser, whose table is the vendored error contract', () => {
  const table = Object.fromEntries(ERRORS.errors.flatMap((e) => [e.code, ...e.from].map((c) => [c, [e.code, e.status, e.type, e.sdk, e.retry, e.next]])));
  for (const f of FILES.slice(1)) {
    const codes = load(f).nodes.filter((n) => n.type === 'n8n-nodes-base.code' && n.parameters.jsCode.includes('function norm('));
    assert.ok(codes.length >= 1, `${f} has a normaliser`);
    for (const c of codes) assert.deepEqual(JSON.parse(c.parameters.jsCode.match(/const TABLE = (\{.*\});/)[1]), table);
  }
  assert.equal(ERRORS.schema, 'taifoon.gate.errors.v1');
});
test('the main flow calls the four sub-workflows by id, and each is a sub-workflow (Execute Workflow Trigger)', () => {
  const main = load('taifoon-agentic-commerce');
  const called = main.nodes.filter((n) => n.type === 'n8n-nodes-base.executeWorkflow').map((n) => n.parameters.workflowId.value).sort();
  const subs = FILES.slice(1).map((f) => load(f)).map((w) => (assert.ok(w.nodes.some((n) => n.type === 'n8n-nodes-base.executeWorkflowTrigger'), w.name), w.id)).sort();
  assert.deepEqual(called, subs);
  for (const [from, c] of Object.entries(main.connections)) for (const outs of c.main) for (const t of outs) assert.ok(main.nodes.some((n) => n.name === t.node), `${from} → ${t.node}`);
});
