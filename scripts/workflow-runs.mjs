#!/usr/bin/env node
// _N8N_RUNS_v1_ (2026-10-28): the README's "Workflows, tested" table from workflows/runs.json, the record of every workflow and
// example of this package run in a fresh n8n against the production API (the site's e2e runner, run-n8n-workflows.mjs: each
// trigger path on its own, the node from npm, webhooks fed a sample request with its expected answer, node by node).
//   node scripts/workflow-runs.mjs           write the table between the README's markers
//   node scripts/workflow-runs.mjs --check   exit 1 when the table is not what the record says
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const MARK = ['<!-- workflow-runs -->', '<!-- /workflow-runs -->'];
export const PENDING = (k) => k.startsWith('workflows/ours/pending/');
const SAY = { PASS: 'pass', NEEDS: 'ran up to a need', SUB: 'sub-workflow (runs through its caller)', FAIL: 'FAIL' };

/** one line per need a path stopped on, said once */
const needsOf = (e) => [...new Set(e.paths.flatMap((p) => (p.nodes ?? []).filter((n) => n.status === 'needs').map((n) => n.note)))];

/** The table: one row per file, each trigger path with its verdict; the needs under it. Pure. */
export function tableOf(record) {
  // a pending template (workflows/ours/pending) is not shipped: npm and the public repo leave it out, so the table does too
  const rows = Object.entries(record.files).filter(([k]) => !PENDING(k)).sort(([a], [b]) => a.localeCompare(b, 'en', { numeric: true }));
  const at = [...new Set(rows.map(([, e]) => e.at.slice(0, 10)))].sort();
  const out = [
    MARK[0],
    `Every workflow and example here, run in n8n ${[...new Set(rows.map(([, e]) => e.n8n))].join(', ')} with ${[...new Set(rows.map(([, e]) => e.node_package))].join(', ')} against \`coord.taifoon.dev\` (${at.join(', ')}): each trigger on its own, a webhook fed a sample request and its answer checked. *Ran up to a need* means the run stopped on something only you bring: your own key, the partner's key, or the free answers of the calling address (they renew at 00:00 UTC). The record, node by node: [\`workflows/runs.json\`](workflows/runs.json).`,
    '',
    '| Workflow | Trigger → result |',
    '|---|---|',
    ...rows.map(([k, e]) => {
      const paths = e.paths.map((p) => `${p.trigger ? `${p.trigger} → ` : ''}${SAY[p.verdict]}`).join('<br>');
      const needs = needsOf(e);
      return `| [\`${k.split('/').pop()}\`](${k})<br>${e.name.replace(/\|/g, '/')} | ${paths}${needs.length ? `<br><sub>${needs.join('; ')}</sub>` : ''} |`;
    }),
    MARK[1],
  ];
  return out.join('\n');
}

/** the README with its table replaced */
export function readmeWith(readme, table) {
  const i = readme.indexOf(MARK[0]), k = readme.indexOf(MARK[1]);
  if (i < 0 || k < i) throw new Error(`README.md has no ${MARK[0]} … ${MARK[1]} block`);
  return readme.slice(0, i) + table + readme.slice(k + MARK[1].length);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const record = JSON.parse(readFileSync(join(ROOT, 'workflows', 'runs.json'), 'utf8'));
  const cur = readFileSync(join(ROOT, 'README.md'), 'utf8');
  const next = readmeWith(cur, tableOf(record));
  if (process.argv.includes('--check')) {
    if (next !== cur) { console.error('README.md: the workflow table is not what workflows/runs.json says (node scripts/workflow-runs.mjs)'); process.exit(1); }
    console.log(`README.md: ${Object.keys(record.files).length} workflows, current`);
  } else { writeFileSync(join(ROOT, 'README.md'), next); console.log(`README.md: ${Object.keys(record.files).length} workflows written`); }
}
