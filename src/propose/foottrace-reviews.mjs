import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import native from '../guards/release-github.cjs';
import control from '../guards/release-control.cjs';
import { jsonData, fields, text, id } from '../eco/json-data.mjs';
import { own } from './source-inventory.mjs';
import { createFoottracePendingReader, createFoottracePendingObservationReader, bindFoottracePendingReference } from './foottrace-pending.mjs';
const fail = () => { throw new Error('review-evidence-unavailable'); };
const oneOf = (value, values) => { if (!values.includes(value)) fail(); return value; };
const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
function projectReview(value, users) {
  const user = own(value, 'user'), actorId = id(own(user, 'id'));
  const actorType = oneOf(own(user, 'type'), ['User', 'Bot']);
  if (actorType === 'User') {
    const login = text(own(user, 'login'), /^[A-Za-z0-9-]{1,39}$/, 39);
    if (users.has(actorId) && users.get(actorId) !== login) fail();
    users.set(actorId, login); if (users.size > 64) fail();
  }
  const commit = own(value, 'commit_id'); if (!control.validSha(commit)) fail();
  return jsonData({ id: id(own(value, 'id')), state: oneOf(own(value, 'state'),
    ['APPROVED', 'CHANGES_REQUESTED', 'DISMISSED', 'COMMENTED', 'PENDING']),
  commit_id: commit, user: { id: actorId, type: actorType } });
}
function projectPermission(value, actorId, login) {
  const user = own(value, 'user');
  if (own(user, 'id') !== actorId || own(user, 'type') !== 'User' || own(user, 'login') !== login) fail();
  return jsonData({ user: { id: actorId, type: 'User' }, permission: oneOf(own(value, 'permission'),
    ['admin', 'write', 'maintain', 'triage', 'read', 'none']) });
}
function reviewReason(reviews, head) {
  // Native review IDs order effective APPROVED/CHANGES_REQUESTED/DISMISSED.
  // A comment does not erase an objection. This is refresh eligibility only,
  // never the native merged-release App/User authorization predicate.
  const effective = new Map();
  for (const row of [...reviews].sort((a, b) => a.id - b.id))
    if (['APPROVED', 'CHANGES_REQUESTED', 'DISMISSED'].includes(row.state)) effective.set(row.user.id, row);
  const current = [...effective.values()];
  if (current.some(row => row.state === 'CHANGES_REQUESTED')) return 'effective-refusal';
  if (current.some(row => row.state === 'APPROVED' && row.commit_id === head)) return 'effective-approval';
  if (reviews.some(row => row.state === 'PENDING')) return 'pending-review';
  return null;
}

/** GET-only review/permission evidence. Reuses the actual pending-reference and
 * complete native page guards. The host owns bounded acquisition before parsing.
 * Complete retained workflow/grant/reservation/submission history, private App,
 * current producer identity and effect authority remain separate stages.
 */
function createReviewReader({ api, context, settings }, pendingReader, bindInput = value => value) {
  // Pin owned profile data once; caller mutation cannot retarget later snapshots.
  context = jsonData(context); settings = jsonData(settings);
  if (typeof api !== 'function') throw new TypeError('foottrace-review-profile');
  // Validate the same immutable profile without doing any provider reads yet.
  pendingReader({ api, context, settings });
  return async rawInput => {
    const observations = []; let reason = 'review-evidence-unavailable';
    try {
      const input = bindInput(rawInput);
      const rawRead = async (method, route, body) => {
        if (method !== 'GET' || body !== undefined || observations.length >= 224) fail();
        const item = { kind: 'pending-reference', method: 'GET', route, status: 'unavailable' }; observations.push(item);
        const value = await api(method, route); item.status = 'returned'; return value;
      };
      const pending = pendingReader({ api: rawRead, context, settings });
      const before = await pending(input); if (!before.valid) fail();
      const reference = before.reference, prefix = '/repos/footprintjs/foottrace';
      const users = new Map(), list = `${prefix}/pulls/${reference.pr}/reviews`, permissions = new Map();
      let rowsRead = 0;
      const reviewApi = async (method, route, body) => {
        if (method !== 'GET' || body !== undefined || observations.length >= 224 ||
            !Array.from({ length: 8 }, (_, i) => `${list}?per_page=100&page=${i + 1}`).includes(route)) fail();
        const item = { kind: 'native-reviews', method: 'GET', status: 'unavailable' }; observations.push(item);
        const raw = own(await api(method, route), 'data');
        if (!Array.isArray(raw) || raw.length > 100 || (rowsRead += raw.length) > 256) fail();
        const data = raw.map(row => projectReview(row, users));
        item.status = 'projected'; item.projectionDigest = digest(data); item.count = data.length; return { data };
      };
      const permission = async (actorId, login) => {
        if (observations.length >= 224) fail();
        const item = { kind: 'reviewer-permission', method: 'GET', actorId, status: 'unavailable' }; observations.push(item);
        const route = `${prefix}/collaborators/${encodeURIComponent(login)}/permission`;
        const data = projectPermission(own(await api('GET', route), 'data'), actorId, login);
        item.status = 'projected'; item.projectionDigest = digest(data); return data;
      };
      const reviews = await native.pages(reviewApi, list);
      for (const [actorId, login] of users) permissions.set(actorId, await permission(actorId, login));
      rowsRead = 0;
      const fresh = await native.pages(reviewApi, list);
      if (!isDeepStrictEqual(reviews, fresh)) fail();
      for (const [actorId, login] of users)
        if (!isDeepStrictEqual(permissions.get(actorId), await permission(actorId, login))) fail();
      const after = await pending(input);
      if (!after.valid || !isDeepStrictEqual(before.reference, after.reference)) fail();
      reason = reviewReason(reviews, reference.head);
      if (reason) throw new Error(reason);
      return Object.freeze({ valid: true, scope: 'pending-reviews-only', reference,
        reviewCount: reviews.length, reviewerCount: users.size,
        priorHeadApprovalReviews: reviews.filter(row => row.state === 'APPROVED' && row.commit_id !== reference.head).length,
        reviewDigest: digest(reviews), permissionDigest: digest([...permissions.values()]),
        retainedEligibilityAdmitted: false, privateAppIdentityAdmitted: false, authorized: false,
        adjacentSnapshotOnly: true, observations: Object.freeze(observations.map(Object.freeze)) });
    } catch {
      return Object.freeze({ valid: false, reason: reason ?? 'review-evidence-unavailable',
        retainedEligibilityAdmitted: false, authorized: false, observations: Object.freeze(observations.map(Object.freeze)) });
    }
  };
}

/** Prepared ref-refresh path: retain the independent eight-hop source join. */
export function createFoottraceReviewReader(options) {
  return createReviewReader(options, createFoottracePendingReader);
}

/** Current-reference review DATA. No historical preparation creator is needed
 * for same-tree metadata inspection. This does not admit writer or retained
 * workflow/reservation/submission authority. The expected reference is an owned,
 * exact join to independently observed native P, never a caller approval flag.
 */
export function createFoottraceReviewObservationReader(options) {
  const context = fields(jsonData(options.context), ['repository', 'sha']);
  const bind = value => bindFoottracePendingReference(value, context.sha);
  return createReviewReader(options, profile => {
    const observe = createFoottracePendingObservationReader(profile);
    return async expected => {
      const actual = await observe();
      if (!actual.valid || !isDeepStrictEqual(actual.reference, expected))
        return Object.freeze({ valid: false, reason: 'review-evidence-unavailable', authorized: false });
      return actual;
    };
  }, bind);
}
