// _N8N_RUNS_v1_: every workflow and example this package ships has a recorded run of its current bytes (workflows/runs.json,
// the site's e2e runner, run-n8n-workflows.mjs), no path of it failed, and the README's table is what the record says.
// A changed workflow fails here until it is run again.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { readFileSync, readdirSync, statSync } = require('node:fs');
const { join } = require('node:path');

const ROOT = join(__dirname, '..');
const record = JSON.parse(readFileSync(join(ROOT, 'workflows', 'runs.json'), 'utf8'));
/** every JSON n8n imports as a workflow under workflows/ (all depths) and examples/ */
function shipped() {
  const out = [];
  const walk = (rel) => {
    for (const f of readdirSync(join(ROOT, rel))) {
      const r = `${rel}/${f}`;
      if (r === 'workflows/ours/pending' || r === 'workflows/ours/coord-lang') continue; // not shipped (npm "files", PUBLIC_FILES)
      if (statSync(join(ROOT, r)).isDirectory()) { walk(r); continue; }
      if (!f.endsWith('.json') || f === 'runs.json') continue;
      let w; try { w = JSON.parse(readFileSync(join(ROOT, r), 'utf8')); } catch { continue; }
      if (w && Array.isArray(w.nodes) && w.connections) out.push(r);
    }
  };
  walk('workflows'); walk('examples');
  return out.sort();
}

test('every shipped workflow has a run of its current bytes and no failed path', () => {
  assert.equal(record.schema, 'taifoon.n8n.workflow-runs.v1');
  for (const k of shipped()) {
    const e = record.files[k];
    assert.ok(e, `${k}: not run (the e2e runner: run-n8n-workflows.mjs --dir … --only ${k.split('/').pop()})`);
    assert.equal(e.sha256, createHash('sha256').update(readFileSync(join(ROOT, k))).digest('hex'), `${k} changed since its run`);
    for (const p of e.paths) assert.notEqual(p.verdict, 'FAIL', `${k} [${p.trigger}]`);
  }
  for (const k of Object.keys(record.files)) assert.ok(shipped().includes(k) || k.startsWith('workflows/ours/pending/'), `${k}: in the record, not shipped`);
  assert.doesNotMatch(JSON.stringify(record), /tfr_[A-Za-z0-9_-]{16,}|tfn_live_|sk-[A-Za-z0-9]{20,}/);
});

test('the README table is what the record says', async () => {
  const { tableOf, readmeWith } = await import('../scripts/workflow-runs.mjs');
  const readme = readFileSync(join(ROOT, 'README.md'), 'utf8');
  assert.equal(readmeWith(readme, tableOf(record)), readme, 'node scripts/workflow-runs.mjs');
});
