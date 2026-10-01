// The request the n8n node builds for one operation, derived from the BUILT node description and nothing else.
//
// The node is declarative: n8n's routing engine turns `routing.request` on the chosen operation plus `routing.send` on
// every visible parameter into one HTTP request. This module replays exactly that, so a test calls the API with the
// request the node would send — same method, path, query, body shape and headers — instead of a hand-written copy that
// can drift from the description. Shared by the live op tests (ops.test.js), the measurement (measure.mjs) and anyone
// testing example workflows against the API.
//
//   const { operations, buildRequest } = require('./node-request');
//   operations()                              → [{ resource, operation, name, method, url, keyed }] for every op shipped
//   buildRequest('agent', 'match', { required_skills: 'x' }, { apiKey })   → { method, url, qs, body, headers }
//
// What it models (n8n-workflow routing, the subset this node uses): expressions `={{ … }}` over $value / $parameter,
// displayOptions show/hide over any parameter (resource, operation, a mode switch), defaults for parameters not given,
// collections (only the options present are sent), hidden constants, dotted body properties, `type: 'query'`,
// option-level qs/body, preSend hooks (headers), requestDefaults (baseURL + headers), and the credential's X-API-Key.
'use strict';
const path = require('node:path');

const DIST = process.env.N8N_NODE_DIST || path.join(__dirname, '..', '..', 'dist');
const load = () => {
	const { Taifoon } = require(path.join(DIST, 'nodes/Taifoon/Taifoon.node.js'));
	const { TaifoonRelayerApi } = require(path.join(DIST, 'credentials/TaifoonRelayerApi.credentials.js'));
	return { d: new Taifoon().description, cred: new TaifoonRelayerApi() };
};

/** n8n expression: a string starting with "=" holds {{ … }} parts evaluated with $value / $parameter. */
function evaluate(v, ctx) {
	if (typeof v !== 'string' || !v.startsWith('=')) return v;
	const src = v.slice(1);
	const run = (expr) => new Function('$value', '$parameter', '$json', '$execution', `return (${expr});`)(ctx.$value, ctx.$parameter, ctx.$json ?? {}, ctx.$execution ?? { id: 'test' });
	const whole = src.match(/^\s*\{\{([\s\S]*)\}\}\s*$/);
	if (whole && !whole[1].includes('}}')) return run(whole[1]);
	return src.replace(/\{\{([\s\S]*?)\}\}/g, (_, e) => String(run(e)));
}

function setPath(obj, dotted, value) {
	const parts = dotted.split('.');
	let o = obj;
	for (let i = 0; i < parts.length - 1; i++) o = o[parts[i]] = o[parts[i]] && typeof o[parts[i]] === 'object' ? o[parts[i]] : {};
	o[parts[parts.length - 1]] = value;
}

const matches = (cond, params) => Object.entries(cond).every(([k, list]) => list.includes(params[k]));
function visible(p, params) {
	const s = p.displayOptions?.show; const h = p.displayOptions?.hide;
	if (s && !matches(s, params)) return false;
	if (h && Object.entries(h).some(([k, list]) => list.includes(params[k]))) return false;
	return true;
}

/** Every operation the node ships: resource, operation value, display name, method, url (as written), keyed. */
function operations() {
	const { d } = load();
	const keyedResources = d.credentials[0].displayOptions.show.resource;
	const out = [];
	for (const p of d.properties) {
		if (p.name !== 'operation') continue;
		const resource = p.displayOptions.show.resource[0];
		for (const o of p.options) {
			const r = o.routing?.request ?? {};
			out.push({ resource, operation: o.value, name: o.name, method: r.method, url: r.url, qs: r.qs ?? null, credentialOffered: keyedResources.includes(resource) });
		}
	}
	return out;
}

/** The parameters n8n would hold for this op: the given ones over each visible parameter's default. */
function paramsFor(d, resource, operation, given) {
	const params = { resource, operation, ...given };
	// two passes: a mode switch's default decides which of the fields behind it are visible
	for (let pass = 0; pass < 2; pass++)
		for (const p of d.properties) if (!(p.name in params) && visible(p, params) && p.name !== 'operation') params[p.name] = p.default;
	return params;
}

/**
 * The request the node sends for one operation. `given` are the parameters a user would set (collections as objects of
 * option name → value). `opts.apiKey` adds the credential (n8n sends it on every request once a credential is attached).
 */
async function buildRequest(resource, operation, given = {}, opts = {}) {
	const { d } = load();
	const opProp = d.properties.find((p) => p.name === 'operation' && p.displayOptions.show.resource[0] === resource);
	if (!opProp) throw new Error(`no resource ${resource}`);
	const op = opProp.options.find((o) => o.value === operation);
	if (!op) throw new Error(`no operation ${resource}.${operation}`);
	const params = paramsFor(d, resource, operation, given);
	const ctx = (value) => ({ $value: value, $parameter: params });
	const r = op.routing.request;
	const req = { method: r.method, url: evaluate(r.url, ctx(undefined)), qs: {}, body: {}, headers: { ...(d.requestDefaults.headers ?? {}) }, baseURL: d.requestDefaults.baseURL };
	for (const [k, v] of Object.entries(r.qs ?? {})) { const x = evaluate(v, ctx(undefined)); if (x !== undefined) req.qs[k] = x; }
	for (const [k, v] of Object.entries(r.body ?? {})) { const x = evaluate(v, ctx(undefined)); if (x !== undefined) setPath(req.body, k, x); }
	const preSends = [];
	const apply = (send, raw) => {
		if (!send) return;
		if (send.preSend) preSends.push(...send.preSend);
		if (!send.property) return;
		const value = send.value !== undefined ? evaluate(send.value, ctx(raw)) : raw;
		if (value === undefined) return;
		if (send.type === 'query') req.qs[send.property] = value;
		else setPath(req.body, send.property, value);
	};
	for (const p of d.properties) {
		if (p.name === 'operation' || p.name === 'resource' || !visible(p, params)) continue;
		if (p.type === 'collection' || p.type === 'fixedCollection') {
			const chosen = params[p.name] ?? {};
			for (const o of p.options ?? []) if (o.name in chosen) apply(o.routing?.send, chosen[o.name]);
			continue;
		}
		apply(p.routing?.send, params[p.name]);
	}
	let out = { url: req.url, method: req.method, headers: req.headers };
	for (const f of preSends) out = await f.call({}, out);
	req.headers = out.headers;
	if (opts.apiKey) req.headers['X-API-Key'] = opts.apiKey;
	const hasBody = Object.keys(req.body).length > 0;
	return { method: req.method, url: req.url, qs: req.qs, body: hasBody ? req.body : undefined, headers: req.headers, baseURL: req.baseURL };
}

/** The full URL of a built request (baseURL + url + query), as n8n would call it. */
function fullUrl(req, base = req.baseURL) {
	const u = new URL(base.replace(/\/+$/, '') + req.url);
	for (const [k, v] of Object.entries(req.qs ?? {})) u.searchParams.set(k, typeof v === 'object' ? JSON.stringify(v) : String(v));
	return u.toString();
}

/**
 * Send a built request. `extraHeaders` ride beside the node's own (the tests add x-taifoon-probe on keyless calls so the
 * layer counts them as ours). Returns status, headers, body (parsed JSON or text), bytes and latency in ms.
 */
async function send(req, { base, extraHeaders = {}, timeoutMs = 60_000, method } = {}) {
	const t0 = performance.now();
	const r = await fetch(fullUrl(req, base), {
		method: method ?? req.method,
		headers: { ...req.headers, ...extraHeaders },
		body: req.body !== undefined && (method ?? req.method) !== 'GET' ? JSON.stringify(req.body) : undefined,
		signal: AbortSignal.timeout(timeoutMs),
	});
	const text = await r.text();
	const ms = performance.now() - t0;
	let json = null;
	try { json = text ? JSON.parse(text) : null; } catch { json = null; }
	return { status: r.status, headers: r.headers, type: r.headers.get('content-type') ?? '', text, json, bytes: Buffer.byteLength(text), ms };
}

module.exports = { operations, buildRequest, fullUrl, send, evaluate, load };
