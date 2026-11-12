import assert from 'node:assert/strict';
import { test } from 'node:test';
import { runHold } from '../../src/hold/run.mjs';

const TOKEN = 'ghs_SecretTokenValue123';
const P1 = 'a'.repeat(40); // the base tip the merge was made on
const P2 = 'b'.repeat(40); // the pull request head
const env = (extra = {}) => ({ HOLD_MODE: 'publish', GITHUB_REPOSITORY: 'footprintjs/example', GH_TOKEN: TOKEN, ...extra });
const prEnv = (extra = {}) => env({ HOLD_MODE: 'pull-request', HOLD_EVENT_NAME: 'pull_request', HOLD_HEAD_SHA: P2, ...extra });
const item = (number, extra = {}) => ({ number, title: `hold ${number}`, ...extra });
// A fetch that answers from a list of pages and records every call.
function pages(...bodies) {
  const calls = [];
  const fetcher = async (url, options) => {
    calls.push({ url, options });
    const body = bodies[calls.length - 1];
    if (body instanceof Error) throw body;
    if (body instanceof Response) return body;
    return Response.json(body);
  };
  return { fetcher, calls };
}
// A fake git over a merge commit M = merge(P1, P2): `rev-list` answers with the parents and
// `cat-file` answers by revision (P1 = base tip, HEAD = merged result).
const gitOf = (base, head, row = `MERGE ${P1} ${P2}`) => (args) => {
  if (args[0] === 'rev-list') return `${row.replace('MERGE', 'c'.repeat(40))}\n`;
  const spec = args.at(-1);
  const value = spec === `${P1}:package.json` ? base : spec === 'HEAD:package.json' ? head : undefined;
  if (value === undefined) throw new Error('fatal: no such blob');
  return value;
};
const pkg = (version) => JSON.stringify({ name: 'x', version });
const noGit = () => { throw new Error('git must not be used in publish mode'); };
const said = (result) => result.lines.join('\n');
const failedToCheck = (result) => { assert.equal(result.code, 1); assert.match(said(result), /could not check/); };

test('the request goes to the one fixed path: open, labelled, 100 per page, with the token in a header', async () => {
  const { fetcher, calls } = pages([]);
  const result = await runHold({ env: env(), fetcher, git: noGit });
  assert.equal(result.code, 0);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://api.github.com/repos/footprintjs/example/issues?state=open&labels=hold-release&per_page=100');
  assert.equal(calls[0].options.method, 'GET');
  assert.equal(calls[0].options.redirect, 'error');
  assert.equal(calls[0].options.headers.authorization, `Bearer ${TOKEN}`);
});
test('GITHUB_API_URL is honoured when it is a plain https URL', async () => {
  const { fetcher, calls } = pages([]);
  await runHold({ env: env({ GITHUB_API_URL: 'https://ghe.example/api/v3/' }), fetcher, git: noGit });
  assert.equal(calls[0].url, 'https://ghe.example/api/v3/repos/footprintjs/example/issues?state=open&labels=hold-release&per_page=100');
});
test('a hold fails publish mode and the output names it', async () => {
  const { fetcher } = pages([item(12, { pull_request: {} })]);
  const result = await runHold({ env: env(), fetcher, git: noGit });
  assert.equal(result.code, 1);
  assert.match(said(result), /#12 \(pull request\) "hold 12"/);
});
test('pagination follows full pages, stops at a short one, and names holds from every page', async () => {
  const first = Array.from({ length: 100 }, (_, i) => item(i + 1));
  const second = [item(101), item(102)];
  const { fetcher, calls } = pages(first, second);
  const result = await runHold({ env: env(), fetcher, git: noGit });
  assert.equal(calls.length, 2);
  assert.match(calls[1].url, /&per_page=100&page=2$/);
  assert.match(said(result), /\(102\)/);
});
test('pagination refuses past its bound and says which', async () => {
  const full = Array.from({ length: 100 }, (_, i) => item(i + 1));
  const { fetcher, calls } = pages(full, full, full, full, full, full);
  const result = await runHold({ env: env(), fetcher, git: noGit });
  failedToCheck(result);
  assert.equal(calls.length, 5);
  assert.match(said(result), /more than 500/);
});
test('fail closed: every way the request can go wrong', async () => {
  const cases = {
    'network error': new TypeError(`fetch failed for token ${TOKEN}`),
    'timeout': Object.assign(new Error('aborted'), { name: 'TimeoutError' }),
    'HTTP 500': new Response('oops', { status: 500 }),
    'rate limit': new Response('slow down', { status: 403 }),
    'HTTP 429': new Response('', { status: 429 }),
    'not found': new Response('{}', { status: 404 }),
    'redirect': new Response('', { status: 301 }),
    'not JSON': new Response('<html>', { status: 200 }),
    'object, not a list': Response.json({ message: 'Not Found' }),
    'null': Response.json(null),
    'item without a number': Response.json([{ title: 'x' }]),
    'item without a title': Response.json([{ number: 3 }]),
    'item that is not an object': Response.json([7]),
    'more than a page': Response.json(Array.from({ length: 101 }, (_, i) => item(i + 1))),
  };
  for (const [name, body] of Object.entries(cases)) {
    const { fetcher } = pages(body);
    const result = await runHold({ env: env(), fetcher, git: noGit });
    assert.equal(result.code, 1, name);
    assert.match(said(result), /could not check/, name);
  }
});
test('fail closed: a failure on a LATER page is a failure, not "the first page was empty enough"', async () => {
  const first = Array.from({ length: 100 }, (_, i) => item(i + 1));
  const { fetcher } = pages(first, new Response('', { status: 502 }));
  failedToCheck(await runHold({ env: env(), fetcher, git: noGit }));
});
test('fail closed: a response that is not a Response, or whose body cannot be read', async () => {
  failedToCheck(await runHold({ env: env(), fetcher: async () => undefined, git: noGit }));
  failedToCheck(await runHold({ env: env(), fetcher: async () => ({ status: 200, text: async () => { throw new Error('boom'); } }), git: noGit }));
  failedToCheck(await runHold({ env: env(), fetcher: undefined, git: noGit }));
});
test('fail closed: unknown mode, missing or malformed repository, token, API URL', async () => {
  const { fetcher, calls } = pages([]);
  for (const extra of [{ HOLD_MODE: 'release' }, { HOLD_MODE: '' }, { HOLD_MODE: undefined }, { GITHUB_REPOSITORY: undefined },
    { GITHUB_REPOSITORY: 'justaname' }, { GITHUB_REPOSITORY: 'a/b/c' }, { GITHUB_REPOSITORY: 'a/b?x=1' }, { GH_TOKEN: undefined }, { GH_TOKEN: '' },
    { GH_TOKEN: 'two words' }, { GH_TOKEN: 'line\nbreak' }, { GITHUB_API_URL: 'http://api.github.com' }, { GITHUB_API_URL: 'https://u:p@x.example' },
    { GITHUB_API_URL: 'https://x.example/?q=1' }, { GITHUB_API_URL: 'not a url' }]) {
    failedToCheck(await runHold({ env: env(extra), fetcher, git: noGit }));
  }
  assert.equal(calls.length, 0, 'no request is made with unusable inputs');
});
test('pull-request mode: version change with a hold fails; no change passes; no hold passes', async () => {
  const hold = pages([item(4)]);
  const changed = await runHold({ env: prEnv(), fetcher: hold.fetcher, git: gitOf(pkg('1.0.0'), pkg('1.0.1')) });
  assert.equal(changed.code, 1);
  assert.match(said(changed), /1\.0\.0 -> 1\.0\.1/);
  const same = await runHold({ env: prEnv(), fetcher: pages([item(4)]).fetcher, git: gitOf(pkg('1.0.0'), pkg('1.0.0')) });
  assert.equal(same.code, 0);
  const none = await runHold({ env: prEnv(), fetcher: pages([]).fetcher, git: gitOf(pkg('1.0.0'), pkg('2.0.0')) });
  assert.equal(none.code, 0);
});
test('pull-request mode asks git for the parents of HEAD, then the first parent blob and the HEAD blob, nothing else', async () => {
  const asked = [];
  const inner = gitOf(pkg('1.0.0'), pkg('1.0.0'));
  const git = (args) => { asked.push(args); return inner(args); };
  await runHold({ env: prEnv(), fetcher: pages([]).fetcher, git });
  assert.deepEqual(asked, [['rev-list', '--parents', '-n', '1', 'HEAD'], ['cat-file', 'blob', `${P1}:package.json`], ['cat-file', 'blob', 'HEAD:package.json']]);
});
test('fail closed: a version that cannot be read on either side, even with no hold open', async () => {
  const bad = [
    ['missing file', () => { throw new Error('fatal: path package.json does not exist'); }],
    ['not JSON', gitOf('{nope', pkg('1.0.0'))],
    ['head not JSON', gitOf(pkg('1.0.0'), '')],
    ['no version', gitOf(JSON.stringify({ name: 'x' }), pkg('1.0.0'))],
    ['version not a string', gitOf(pkg('1.0.0'), JSON.stringify({ version: 2 }))],
    ['empty version', gitOf(pkg(''), pkg('1.0.0'))],
    ['array, not an object', gitOf('[]', pkg('1.0.0'))],
    ['null', gitOf('null', pkg('1.0.0'))],
    ['inherited version only', gitOf('{"__proto__":{"version":"9"}}', pkg('1.0.0'))],
  ];
  for (const [name, git] of bad) {
    for (const body of [[], [item(1)]]) {
      const result = await runHold({ env: prEnv(), fetcher: pages(body).fetcher, git });
      assert.equal(result.code, 1, name);
      assert.match(said(result), /could not check/, name);
    }
  }
});
test('fail closed: not a pull_request event (including pull_request_target and push), with a hold open or not', async () => {
  for (const HOLD_EVENT_NAME of [undefined, '', 'push', 'workflow_dispatch', 'pull_request_target', 'Pull_Request', 'pull_request ']) {
    for (const body of [[], [item(1)]]) {
      const result = await runHold({ env: prEnv({ HOLD_EVENT_NAME }), fetcher: pages(body).fetcher, git: gitOf(pkg('1.0.0'), pkg('1.0.0')) });
      failedToCheck(result);
      assert.match(said(result), /pull_request event/);
    }
  }
});
test('fail closed: a missing, short, non-hex, uppercase or all-zero pull request head SHA', async () => {
  for (const HOLD_HEAD_SHA of [undefined, '', 'abc', 'g'.repeat(40), '0'.repeat(40), `${P2}\n`, 'B'.repeat(40)])
    failedToCheck(await runHold({ env: prEnv({ HOLD_HEAD_SHA }), fetcher: pages([item(1)]).fetcher, git: gitOf(pkg('1'), pkg('1')) }));
});
test('fail closed: HEAD is not a merge commit with exactly two parents', async () => {
  for (const row of ['MERGE', `MERGE ${P1}`, `MERGE ${P1} ${P2} ${'d'.repeat(40)}`, `MERGE ${P1} not-a-sha`, `MERGE ${P1} ${'0'.repeat(40)}`]) {
    const result = await runHold({ env: prEnv(), fetcher: pages([item(1)]).fetcher, git: gitOf(pkg('1.0.0'), pkg('2.0.0'), row) });
    failedToCheck(result);
    assert.match(said(result), /two parents/);
  }
  const broken = () => { throw new Error('fatal: not a git repository'); };
  failedToCheck(await runHold({ env: prEnv(), fetcher: pages([]).fetcher, git: broken }));
});
test('fail closed: the second parent is another commit than the pull request head', async () => {
  const other = 'e'.repeat(40);
  const result = await runHold({ env: prEnv(), fetcher: pages([item(1)]).fetcher, git: gitOf(pkg('1.0.0'), pkg('2.0.0'), `MERGE ${P1} ${other}`) });
  failedToCheck(result);
  assert.match(said(result), /not the merge of this pull request head/);
  // the first parent being the head is not enough: it is the BASE side
  failedToCheck(await runHold({ env: prEnv(), fetcher: pages([]).fetcher, git: gitOf(pkg('1.0.0'), pkg('1.0.0'), `MERGE ${P2} ${P1}`) }));
});
test('the token never appears in any output, even when an error carries it', async () => {
  const outputs = [];
  outputs.push(await runHold({ env: env(), fetcher: pages(new TypeError(`connect failed, header Bearer ${TOKEN}`)).fetcher, git: noGit }));
  outputs.push(await runHold({ env: env(), fetcher: pages(new Response('', { status: 500 })).fetcher, git: noGit }));
  outputs.push(await runHold({ env: env(), fetcher: pages([item(1, { title: `my token is ${TOKEN}` })]).fetcher, git: noGit }));
  outputs.push(await runHold({ env: env({ HOLD_MODE: 'bad' }), fetcher: pages([]).fetcher, git: noGit }));
  outputs.push(await runHold({ env: env(), fetcher: pages([]).fetcher, git: noGit }));
  for (const result of outputs) assert.equal(said(result).includes(TOKEN), false, said(result));
});
test('a hostile title cannot start a workflow command', async () => {
  const { fetcher } = pages([item(2, { title: '\n::set-env name=A::b\n::add-mask::x' })]);
  const result = await runHold({ env: env(), fetcher, git: noGit });
  assert.equal(result.lines.some((line) => line.startsWith('::') || line.includes('\n')), false);
});
