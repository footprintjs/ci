import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import native from '../guards/release-github.cjs';
import control from '../guards/release-control.cjs';
import { fields, jsonData } from '../eco/json-data.mjs';
import { own } from './source-inventory.mjs';
const fail = () => { throw new Error('pending-reference-unavailable'); };
const positive = value => { if (!Number.isSafeInteger(value) || value <= 0) fail(); return value; };
const sha = value => { if (!control.validSha(value)) fail(); return value; };
const bool = value => { if (typeof value !== 'boolean') fail(); return value; };
const oneOf = (value, values) => { if (typeof value !== 'string' || !values.includes(value)) fail(); return value; };
const nullable = (value, reader) => value == null ? null : reader(value);
function time(value) {
  if (typeof value !== 'string' || value.length > 24 || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{3})?Z$/.test(value)) fail();
  const normalized = new Date(value).toISOString();
  if (normalized !== value && normalized.replace('.000Z', 'Z') !== value) fail(); return value;
}
function repo(value) {
  const id = positive(own(value, 'id')), full_name = own(value, 'full_name');
  if (typeof full_name !== 'string' || !/^[A-Za-z0-9_.-]{1,100}\/[A-Za-z0-9_.-]{1,100}$/.test(full_name)) fail();
  return jsonData({ id, full_name });
}
function ref(value) {
  const object = own(value, 'object');
  return jsonData({ object: { sha: sha(own(object, 'sha')), type: oneOf(own(object, 'type'), ['commit']) } });
}
function pull(value) {
  const head = own(value, 'head'), base = own(value, 'base'), user = own(value, 'user');
  return jsonData({ id: positive(own(value, 'id')), number: positive(own(value, 'number')),
    state: oneOf(own(value, 'state'), ['open', 'closed']), merged: nullable(own(value, 'merged'), bool),
    mergedAt: nullable(own(value, 'merged_at'), time), updatedAt: nullable(own(value, 'updated_at'), time),
    mergeSha: nullable(own(value, 'merge_commit_sha'), sha), autoMerge: own(value, 'auto_merge') != null,
    head: { sha: sha(own(head, 'sha')), ref: oneOf(own(head, 'ref'), ['release/next']), repo: repo(own(head, 'repo')) },
    base: { sha: sha(own(base, 'sha')), ref: oneOf(own(base, 'ref'), ['main']), repo: repo(own(base, 'repo')) },
    author: { id: positive(own(user, 'id')), type: oneOf(own(user, 'type'), ['Bot', 'User']) } });
}
function commit(value) {
  const parents = own(value, 'parents');
  if (!Array.isArray(parents) || parents.length !== 2) fail();
  return jsonData({ sha: sha(own(value, 'sha')), tree: { sha: sha(own(own(value, 'tree'), 'sha')) },
    parents: parents.map(parent => ({ sha: sha(own(parent, 'sha')) })) });
}
function expectedReference(prepared, pinned) {
  if (own(prepared, 'valid') !== true || own(prepared, 'profileId') !== 'foottrace-next-v1') fail();
  const source = sha(own(prepared, 'sourceSha')), pending = sha(own(prepared, 'pendingSha')),
    tree = sha(own(prepared, 'pendingTree')), refs = own(prepared, 'preparationRefs');
  if (source !== pinned.sha || source === pending || !Array.isArray(refs) || refs.length < 1 || refs.length > 8) fail();
  for (const row of refs) if (own(row, 'profileId') !== 'foottrace-next-v1' ||
    own(own(row, 'producer'), 'repositoryId') !== pinned.repository.id) fail();
  const last = refs.at(-1);
  if (own(last, 'pendingSha') !== pending || own(last, 'pendingTree') !== tree) fail();
  return jsonData({ source, pending, tree, parents: [sha(own(last, 'sourceSha')),
    sha(refs.length === 1 ? own(own(prepared, 'predecessor'), 'head') : own(refs.at(-2), 'pendingSha'))] });
}
const identity = row => jsonData({ id: row.id, number: row.number, state: row.state, mergedAt: row.mergedAt,
  updatedAt: row.updatedAt, mergeSha: row.mergeSha, autoMerge: row.autoMerge, head: row.head, base: row.base, author: row.author });

/** Read-only CURRENT pending-reference adapter; does not inspect reviews, grants,
 * reservations, publication attempts or private App/current-run authority. The
 * surrounding native flow must separately admit those retained-evidence stages.
 * The host supplies the reviewed bounded GET transport, never saved grant data.
 */
export function createFoottracePendingObservationReader({ api, context, settings }) {
  const pinned = fields(jsonData(context), ['repository', 'sha']); fields(pinned.repository, ['id', 'full_name']);
  const app = fields(jsonData(settings), ['slug']);
  if (typeof api !== 'function' || pinned.repository.full_name !== 'footprintjs/foottrace' ||
      !Number.isSafeInteger(pinned.repository.id) || pinned.repository.id <= 0 || !control.validSha(pinned.sha) ||
      typeof app.slug !== 'string' || !/^[a-z0-9-]{1,100}$/.test(app.slug)) throw new TypeError('foottrace-pending-profile');
  return async () => {
    const observations = [];
    try {
      const prefix = '/repos/footprintjs/foottrace';
      const main = prefix + '/git/ref/heads/main', branch = prefix + '/git/ref/heads/release/next';
      const list = prefix + '/pulls?state=all&head=footprintjs:release/next&base=main', botName = app.slug + '[bot]';
      const projectors = new Map([[main, ref], [branch, ref], [prefix, value => {
        const result = { ...repo(value), archived: bool(own(value, 'archived')), defaultBranch: oneOf(own(value, 'default_branch'), ['main']) };
        if (!control.sameRepo(result, pinned.repository) || result.archived) fail(); return jsonData(result);
      }], [`/users/${encodeURIComponent(botName)}`, value => {
        if (own(value, 'login') !== botName || own(value, 'type') !== 'Bot') fail();
        return jsonData({ id: positive(own(value, 'id')), type: 'Bot' });
      }]]);
      for (let page = 1; page <= 8; page++) projectors.set(`${list}&per_page=100&page=${page}`, value => {
        if (!Array.isArray(value) || value.length > 100) fail(); return value.map(pull);
      });
      const read = async (method, route, body) => {
        if (method !== 'GET' || body !== undefined || !projectors.has(route) || observations.length >= 32) fail();
        const boundary = { method: 'GET', route, status: 'unavailable' }; observations.push(boundary);
        const data = projectors.get(route)(own(await api(method, route), 'data'));
        const bytes = Buffer.from(JSON.stringify(data)); boundary.status = 'projected';
        boundary.projectionBytes = bytes.length; boundary.projectionDigest = createHash('sha256').update(bytes).digest('hex');
        return { data };
      };
      await native.assertCurrentMain(read, pinned);
      await read('GET', prefix); const bot = (await read('GET', `/users/${encodeURIComponent(botName)}`)).data;
      const rows = await native.pages(read, list), open = rows.filter(row => row.state === 'open');
      if (open.length !== 1) fail(); const selected = open[0];
      const detailRoute = `${prefix}/pulls/${selected.number}`; projectors.set(detailRoute, pull);
      const pr = (await read('GET', detailRoute)).data;
      if (pr.state !== 'open' || pr.merged !== false || pr.mergedAt !== null || pr.autoMerge ||
          pr.author.id !== bot.id || pr.author.type !== 'Bot' || pr.head.sha === pinned.sha ||
          !control.sameRepo(pr.head.repo, pinned.repository) ||
          !control.sameRepo(pr.base.repo, pinned.repository) || !isDeepStrictEqual(identity(pr), identity(selected)) ||
          (selected.merged !== null && selected.merged !== false)) fail();
      if ((await read('GET', branch)).data.object.sha !== pr.head.sha) fail();
      const commitRoute = `${prefix}/git/commits/${pr.head.sha}`;
      projectors.set(commitRoute, commit);
      const head = (await read('GET', commitRoute)).data;
      if (head.sha !== pr.head.sha) fail();
      // PR base.sha is observed metadata: it can lag main. Original preparation
      // comes from immutable witnesses; current main comes from the ref reads.
      const fresh = (await read('GET', detailRoute)).data, freshRows = await native.pages(read, list);
      if (!isDeepStrictEqual(pr, fresh) || !isDeepStrictEqual(rows, freshRows) ||
          (await read('GET', branch)).data.object.sha !== pr.head.sha) fail();
      await native.assertCurrentMain(read, pinned);
      return Object.freeze({ valid: true, scope: 'pending-reference-only',
        reference: jsonData({ pr: pr.number, botId: bot.id, head: head.sha, tree: head.tree.sha, source: pinned.sha,
          observedBase: pr.base.sha, parents: head.parents.map(parent => parent.sha) }),
        associatedRows: rows.length, privateAppIdentityAdmitted: false, retainedEligibilityAdmitted: false,
        authorized: false, adjacentSnapshotOnly: true, observations: Object.freeze(observations.map(Object.freeze)) });
    } catch (error) {
      return Object.freeze({ valid: false, reason: 'pending-reference-unavailable', nativeReason: native.refusalCode(error),
        authorized: false, observations: Object.freeze(observations.map(Object.freeze)) });
    }
  };
}


/** Independent prepared-input join over the same actual observation reader.
 * This is still required by review/inspection callers after bootstrap discovery;
 * observing a native P never proves its prepared source, tree or parent law.
 */
export function createFoottracePendingReader(options) {
  const observe = createFoottracePendingObservationReader(options);
  const pinned = fields(jsonData(options.context), ['repository', 'sha']);
  return async prepared => {
    let expected;
    try { expected = expectedReference(prepared, pinned); } catch {
      return Object.freeze({ valid: false, reason: 'pending-reference-unavailable', authorized: false, observations: [] });
    }
    const observed = await observe();
    if (!observed.valid) return observed;
    const reference = observed.reference;
    if (reference.source !== expected.source || reference.head !== expected.pending || reference.tree !== expected.tree ||
        !isDeepStrictEqual(reference.parents, expected.parents))
      return Object.freeze({ valid: false, reason: 'pending-reference-unavailable', authorized: false, observations: observed.observations });
    return observed;
  };
}

/** Closed, owned expected native reference. It is a data join, not proof by
 * itself: every consumer must compare the independently observed actual P.
 */
export function bindFoottracePendingReference(value, sourceSha) {
  const ref = fields(jsonData(value), ['pr','botId','head','tree','source','observedBase','parents']);
  positive(ref.pr); positive(ref.botId); sha(sourceSha);
  for (const key of ['head','tree','source','observedBase']) sha(ref[key]);
  if (ref.source !== sourceSha || ref.head === ref.source || !Array.isArray(ref.parents) ||
      ref.parents.length !== 2 || new Set(ref.parents).size !== 2) fail();
  for (const parent of ref.parents) if (sha(parent) === ref.head) fail();
  return ref;
}
