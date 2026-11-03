import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import native from '../guards/release-github.cjs';
import control from '../guards/release-control.cjs';
import { jsonData, id, text, array } from '../eco/json-data.mjs';
import { own } from './source-inventory.mjs';
import { foottraceInvocationContext } from './foottrace-context.mjs';
import { foottraceTransportPort } from './foottrace-transport.mjs';
import {bindAppIdentityFacts} from './app-identity-facts.mjs';
const fail = () => { throw new Error('current-proposer-unavailable'); };
const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const repo = value => ({ id: id(own(value, 'id')),
  full_name: text(own(value, 'full_name'), /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/, 201) });
const sha = value => { if (!control.validSha(value)) fail(); return value; };
const statuses = ['completed', 'queued', 'in_progress', 'requested', 'waiting', 'pending', 'action_required'];
const conclusions = ['success', 'failure', 'neutral', 'cancelled', 'skipped', 'timed_out', 'action_required', 'stale', 'startup_failure'];
function state(raw) {
  const status = own(raw, 'status'), conclusion = own(raw, 'conclusion');
  if (!statuses.includes(status) || (conclusion !== null && !conclusions.includes(conclusion))) fail();
  return { status, conclusion };
}
/** Cached key-holder App facts and live current producer observations only. This deliberately
 * leaves writer credential-to-job binding and complete retained eligibility
 * unadmitted; it never grants a ref write, archive approval or publication.
 */
export function createFoottraceProposerReader({ transport, context }) {
  let pinned, port;
  try {
    pinned = foottraceInvocationContext(context);
    port = foottraceTransportPort(transport, { requests: 128, totalBytes: 8 * 1024 * 1024 });
    if (!control.sameRepo(port.repository, pinned.repository)) fail();
    bindAppIdentityFacts(port.identityFacts,{repository:pinned.repository,...port.settings,context:pinned});
  } catch { port = null; }
  return async prepared => {
    const observations = [];
    try {
      if (!port || own(prepared, 'valid') !== true || own(prepared, 'sourceSha') !== pinned.sha ||
          !control.validSha(own(prepared, 'sourceTree'))) fail();
      const active = foottraceTransportPort(transport, { requests: 128, totalBytes: 8 * 1024 * 1024 });
      const prefix = '/repos/footprintjs/foottrace', { settings } = active, routes = new Map();
      routes.set(prefix, raw => {
        const value = { ...repo(raw), archived: own(raw, 'archived'), defaultBranch: own(raw, 'default_branch'),
          push: own(own(raw, 'permissions'), 'push') };
        if (!control.sameRepo(value, pinned.repository) || value.archived !== false || value.defaultBranch !== 'main' || (value.push !== true && !(active.inspectionReadOnly && value.push === false))) fail();
        return value;
      });
      routes.set(prefix + '/git/ref/heads/main', raw => ({ object: { sha: sha(own(own(raw, 'object'), 'sha')) } }));
      routes.set(prefix + '/git/commits/' + pinned.sha, raw => ({ sha: sha(own(raw, 'sha')), tree: { sha: sha(own(own(raw, 'tree'), 'sha')) } }));
      routes.set('/apps/' + settings.slug, raw => {
        if (own(raw, 'slug') !== settings.slug || own(raw, 'client_id') !== settings.clientId) fail();
        return { id: id(own(raw, 'id')), settingsDigest: digest(settings) };
      });
      routes.set('/users/' + encodeURIComponent(settings.slug + '[bot]'), raw => {
        if (own(raw, 'type') !== 'Bot' || own(raw, 'login') !== settings.slug + '[bot]') fail();
        return { id: id(own(raw, 'id')) };
      });
      routes.set(prefix + '/actions/runs/' + pinned.runId, raw => ({
        id: id(own(raw, 'id')), run_attempt: id(own(raw, 'run_attempt')), head_sha: sha(own(raw, 'head_sha')),
        repository: repo(own(raw, 'repository')), head_repository: repo(own(raw, 'head_repository')),
        path: text(own(raw, 'path'), /^\.github\/workflows\/[A-Za-z0-9_.-]+\.ya?ml$/, 256),
        head_branch: text(own(raw, 'head_branch'), /^[A-Za-z0-9_./-]+$/, 200),
        event: text(own(raw, 'event'), /^[a-z_]+$/, 100), ...state(raw) }));
      const jobs = prefix + '/actions/runs/' + pinned.runId + '/attempts/' + pinned.runAttempt + '/jobs';
      for (let page = 1; page <= 8; page++) routes.set(jobs + '?per_page=100&page=' + page, raw => {
        const count = own(raw, 'total_count'), rows = array(own(raw, 'jobs'), 32);
        if (!Number.isSafeInteger(count) || count < 0 || count > 32) fail();
        const values = [];
        for (let i = 0; i < rows.length; i++) {
          const row = own(rows, String(i)); values.push({ id: id(own(row, 'id')),
            name: text(own(row, 'name'), /^[A-Za-z0-9 _./()-]+$/, 128), run_id: id(own(row, 'run_id')),
            run_attempt: id(own(row, 'run_attempt')), head_sha: sha(own(row, 'head_sha')), ...state(row) });
        }
        return { total_count: count, jobs: values };
      });
      const api = async (method, route, body) => {
        if (method !== 'GET' || body !== undefined || !routes.has(route) || observations.length >= 32) fail();
        const item = { kind: route.startsWith('/apps/')?'cached-key-holder-identity':'native-current-identity', method: 'GET', status: 'unavailable' }; observations.push(item);
        const value = jsonData(routes.get(route)(own(await active.api(method, route), 'data')));
        item.status = 'projected'; item.digest = digest(value); return { data: value };
      };
      const phase = async () => {
        await native.assertCurrentMain(api, pinned);
        await api('GET', prefix);
        const commit = (await api('GET', prefix + '/git/commits/' + pinned.sha)).data;
        if (commit.sha !== pinned.sha || commit.tree.sha !== own(prepared, 'sourceTree')) fail();
        const app = (await api('GET', '/apps/' + settings.slug)).data;
        const bot = (await api('GET', '/users/' + encodeURIComponent(settings.slug + '[bot]'))).data;
        const prepare = await native.producerIdentity(api, pinned, 'prepare', true);
        const proposal = await native.producerIdentity(api, pinned, 'proposal');
        if (proposal.status !== 'in_progress' || proposal.conclusion !== null) fail();
        await native.assertCurrentMain(api, pinned);
        return jsonData({ repositoryId: pinned.repository.id, sourceSha: pinned.sha, sourceTree: commit.tree.sha,
          runId: pinned.runId, runAttempt: pinned.runAttempt, prepareJobId: prepare.id, proposalJobId: proposal.id,
          appId: app.id, botId: bot.id, appSettingsDigest: app.settingsDigest });
      };
      const before = await phase(), after = await phase();
      if (!isDeepStrictEqual(before, after)) fail();
      return Object.freeze({ valid: true, scope: 'current-proposer-identity-only', identity: before, digest: digest(before),
        keyHolderIdentityFactsObserved:true,appIdentityObservation:'cached-key-holder-facts',privateAppIdentityAdmitted: false, writerCredentialBindingAdmitted: false, retainedEligibilityAdmitted: false, authorized: false,
        observations: Object.freeze(observations.map(Object.freeze)) });
    } catch (error) {
      return Object.freeze({ valid: false, reason: 'current-proposer-unavailable', nativeReason: native.refusalCode(error),
        privateAppIdentityAdmitted: false, authorized: false, observations: Object.freeze(observations.map(Object.freeze)) });
    }
  };
}
