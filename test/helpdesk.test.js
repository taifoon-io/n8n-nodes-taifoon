// Helpdesk (1.1.0): Show Me Around ++ (_SMA_HELPDESK_v1_). The node is declarative, so these pin the REQUEST each operation
// builds — method, path, query, body and headers — against the coord contracts (lang/cue/api-operations.cue, the four sma rows;
// lang/cue/api-bodies.cue: SmaAsk, SmaLearn, SmaNominate). buildRequest replays n8n's routing engine over the built node.
const test = require('node:test');
const assert = require('node:assert/strict');
const { Taifoon } = require('../dist/nodes/Taifoon/Taifoon.node.js');
const { buildRequest } = require('./live/node-request');

const d = new Taifoon().description;
const ops = (resource) => d.properties.find((p) => p.name === 'operation' && p.displayOptions.show.resource[0] === resource).options;
const route = (resource, op) => ops(resource).find((o) => o.value === op).routing.request;
const KEY = 'tfr_testkey';

test('Helpdesk is a resource with the nine operations on the four sma routes, alphabetical, Ask the default', () => {
	assert.ok(d.properties.find((p) => p.name === 'resource').options.some((o) => o.value === 'helpdesk'));
	const names = ops('helpdesk').map((o) => o.name);
	assert.deepEqual(names, [...names].sort((a, b) => a.localeCompare(b)), 'operations stay alphabetical');
	assert.equal(d.properties.find((p) => p.name === 'operation' && p.displayOptions.show.resource[0] === 'helpdesk').default, 'ask');
	assert.deepEqual(route('helpdesk', 'ask'), { method: 'POST', url: '/sma/ask' });
	assert.deepEqual(route('helpdesk', 'getGraph'), { method: 'GET', url: '/sma/graph' });
	assert.deepEqual(route('helpdesk', 'getWeakest'), { method: 'GET', url: '/sma/graph', qs: { weakest: '1' } });
	for (const op of ['answer', 'grade', 'tune']) assert.deepEqual(route('helpdesk', op), { method: 'POST', url: '/sma/learn' });
	for (const op of ['nominate', 'acceptNomination', 'revokeNomination']) assert.deepEqual(route('helpdesk', op), { method: 'POST', url: '/sma/nominate' });
	assert.equal(d.credentials[0].displayOptions, undefined, 'the relayer key (X-API-Key) rides on every resource, helpdesk included (1.1.0 channel)');
});

test('Ask: POST /sma/ask { product, question, channel: "n8n" } with X-Taifoon-Channel: n8n and the client header; hint and route only when set', async () => {
	const req = await buildRequest('helpdesk', 'ask', { smaProduct: 'taifoon', smaQuestion: 'where is the key my workflow sends?' }, { apiKey: KEY });
	assert.equal(req.method, 'POST');
	assert.equal(req.url, '/sma/ask');
	assert.equal(req.baseURL, 'https://coord.taifoon.dev/v1');
	assert.deepEqual(req.body, { product: 'taifoon', question: 'where is the key my workflow sends?', channel: 'n8n' }, 'SmaAsk: product, question, channel and nothing the route would ignore');
	assert.deepEqual(req.qs, {});
	assert.equal(req.headers['X-Taifoon-Channel'], 'n8n', 'the outlet, as the authNote names it');
	assert.equal(req.headers['X-API-Key'], KEY);
	assert.match(req.headers['X-Taifoon-Client'], /^n8n-nodes-taifoon\/\d+\.\d+\.\d+$/);
	assert.equal(req.headers['Content-Type'], 'application/json');
	const hinted = await buildRequest('helpdesk', 'ask', { smaProduct: 'taifoon', smaQuestion: 'what is this field?', smaAskOptions: { hint: 'pricing.table', route: 'specialist' } });
	assert.deepEqual(hinted.body, { product: 'taifoon', question: 'what is this field?', channel: 'n8n', hint: 'pricing.table', route: 'specialist' });
	assert.equal(hinted.headers['X-Taifoon-Channel'], 'n8n');
	assert.equal(hinted.headers['X-API-Key'], undefined, 'no credential, no key header');
	const empty = await buildRequest('helpdesk', 'ask', { smaProduct: 'taifoon', smaQuestion: 'what is this field?', smaAskOptions: { hint: '' } });
	assert.equal('hint' in empty.body, false, 'an empty hint is not sent');
	const routes = d.properties.find((p) => p.name === 'smaAskOptions').options.find((o) => o.name === 'route').options.map((o) => o.value).sort();
	assert.deepEqual(routes, ['agent', 'community', 'graph', 'person', 'specialist'], 'the SmaAsk route enum');
});

test('Graph and Weakest: GET /sma/graph?product=&scope=, weakest=1 only on Get Weakest, no body', async () => {
	const graph = await buildRequest('helpdesk', 'getGraph', { smaGraphProduct: 'taifoon' });
	assert.equal(graph.method, 'GET');
	assert.equal(graph.url, '/sma/graph');
	assert.deepEqual(graph.qs, { product: 'taifoon', scope: 'public' }, 'public is the default scope (no key needed)');
	assert.equal(graph.body, undefined);
	assert.equal(graph.headers['X-Taifoon-Channel'], undefined, 'the channel header rides on Ask only');
	const weakest = await buildRequest('helpdesk', 'getWeakest', { smaGraphProduct: 'taifoon', smaGraphScope: 'tenant' }, { apiKey: KEY });
	assert.deepEqual(weakest.qs, { product: 'taifoon', scope: 'tenant', weakest: '1' });
	assert.equal(weakest.body, undefined);
	assert.deepEqual(d.properties.find((p) => p.name === 'smaGraphScope').options.map((o) => o.value).sort(), ['product', 'public', 'tenant']);
});

test('Learn: Answer, Grade and Tune each POST /sma/learn with { case } and exactly one of answer, grade, tuning (SmaLearn)', async () => {
	const answer = await buildRequest('helpdesk', 'answer', { smaCase: 'case_0123456789abcdef', smaAnswerWords: 'Settings → Community Nodes.' }, { apiKey: KEY });
	assert.equal(answer.method, 'POST');
	assert.equal(answer.url, '/sma/learn');
	assert.deepEqual(answer.body, { case: 'case_0123456789abcdef', answer: { words: 'Settings → Community Nodes.' } }, 'an empty fix is not sent');
	const fixed = await buildRequest('helpdesk', 'answer', { smaCase: 'case_0123456789abcdef', smaAnswerWords: 'Use the credential.', smaAnswerFix: 'settings.credentials' });
	assert.deepEqual(fixed.body, { case: 'case_0123456789abcdef', answer: { words: 'Use the credential.', fix: 'settings.credentials' } });

	const grade = await buildRequest('helpdesk', 'grade', { smaCase: 'case_0123456789abcdef', smaGradeScore: 0.8, smaGradeBy: 'buyer' }, { apiKey: KEY });
	assert.equal(grade.method, 'POST');
	assert.equal(grade.url, '/sma/learn');
	assert.deepEqual(grade.body, { case: 'case_0123456789abcdef', grade: { score: 0.8, by: 'buyer' } }, 'SmaLearn.grade: score and by, no answer or tuning beside it');
	assert.equal(grade.headers['X-API-Key'], KEY);
	assert.equal(grade.headers['X-Taifoon-Channel'], 'n8n', 'the channel rides on every call (empty Channel ID: n8n)');
	assert.deepEqual(d.properties.find((p) => p.name === 'smaGradeBy').options.map((o) => o.value).sort(), ['admin', 'buyer', 'jev'], 'the grade.by enum');
	const score = d.properties.find((p) => p.name === 'smaGradeScore');
	assert.deepEqual([score.typeOptions.minValue, score.typeOptions.maxValue], [0, 1]);

	const tune = await buildRequest('helpdesk', 'tune', { smaCase: 'case_0123456789abcdef', smaTuneLoop: 'free-allowance', smaTuneValue: 30 }, { apiKey: KEY });
	assert.deepEqual(tune.body, { case: 'case_0123456789abcdef', tuning: { loop: 'free-allowance', value: 30 } });
	assert.deepEqual(
		d.properties.find((p) => p.name === 'smaTuneLoop').options.map((o) => o.value).sort(),
		['answer-window', 'budget-cap', 'escalation-window', 'free-allowance', 'grade-gate', 'promotion', 'weakest-queue'],
		'the tuning.loop enum',
	);
});

test('Nominate: POST /sma/nominate with the SmaNominate proposal (chains and classes as arrays); Accept and Revoke send { id } with their one flag', async () => {
	const req = await buildRequest(
		'helpdesk',
		'nominate',
		{ smaProduct: 'taifoon', smaExpert: 'key:0123456789abcdef01234567', smaPayee: '0x3574999dd4c96eb73bd6e11d4177010c83e14f5b', smaChains: 'eip155:8453, eip155:36927', smaShareBps: 5000, smaCapMicroPerPeriod: 250000000, smaPeriod: 'day', smaClasses: 'sma.case, sma.fix' },
		{ apiKey: KEY },
	);
	assert.equal(req.method, 'POST');
	assert.equal(req.url, '/sma/nominate');
	assert.deepEqual(req.body, {
		product: 'taifoon',
		expert: 'key:0123456789abcdef01234567',
		payee: '0x3574999dd4c96eb73bd6e11d4177010c83e14f5b',
		chains: ['eip155:8453', 'eip155:36927'],
		share_bps: 5000,
		cap_micro_per_period: 250000000,
		period: 'day',
		classes: ['sma.case', 'sma.fix'],
	});
	assert.equal('id' in req.body, false); assert.equal('accept' in req.body, false); assert.equal('revoke' in req.body, false);
	assert.equal(req.headers['X-API-Key'], KEY);
	const share = d.properties.find((p) => p.name === 'smaShareBps');
	assert.equal(share.typeOptions.maxValue, 7000, 'share_bps ≤ 7000');
	assert.deepEqual(d.properties.find((p) => p.name === 'smaPeriod').options.map((o) => o.value).sort(), ['day', 'month']);

	const accept = await buildRequest('helpdesk', 'acceptNomination', { smaNominationId: 'nom_0123456789abcdef' }, { apiKey: KEY });
	assert.equal(accept.url, '/sma/nominate');
	assert.deepEqual(accept.body, { id: 'nom_0123456789abcdef', accept: true });
	const revoke = await buildRequest('helpdesk', 'revokeNomination', { smaNominationId: 'nom_0123456789abcdef' }, { apiKey: KEY });
	assert.equal(revoke.url, '/sma/nominate');
	assert.deepEqual(revoke.body, { id: 'nom_0123456789abcdef', revoke: true });
	for (const n of ['smaAccept', 'smaRevoke']) assert.equal(d.properties.find((p) => p.name === n).type, 'hidden', `${n} is a constant, not a choice`);
});

test('no Helpdesk operation leaves coord, and no description promises a key back', () => {
	for (const o of ops('helpdesk')) {
		assert.ok(String(o.routing.request.url).startsWith('/sma/'), `${o.value} is on /v1/sma`);
		assert.equal(o.routing.request.baseURL, undefined, 'one host');
		assert.doesNotMatch(o.description, /returns the key|reads the key back/i);
	}
});
