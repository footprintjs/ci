import {isOpaqueCredential} from '../http-credential.cjs';
import native from '../guards/release-github.cjs';
import { jsonData, fields, id, text } from '../eco/json-data.mjs';
import { own } from './source-inventory.mjs';
import { createGitHubTransport } from './github-transport.mjs';
import { bindProposalMetadata } from './proposal-metadata-payload.mjs';
const transports = new WeakMap();
const fail = () => { throw new Error('foottrace-transport-unavailable'); };
/** Runtime-only private native API closure. Its read facet remains GET-only;
 * a separate closed exact-PATCH facet is IO, never a writer grant. No saved/model
 * JSON can supply its opaque brand or code port.
 */
export function createFoottraceTransport({ repository, token, appIdentity, fetcher, limits } = {}) {
  const repo = fields(jsonData(repository), ['id', 'full_name']); id(repo.id);
  if (repo.full_name !== 'footprintjs/foottrace') fail();
  // Credentials are opaque. Bound safe header bytes without parsing legacy or JWT formats.
  if (!isOpaqueCredential(token)) fail();
  const slug = text(own(appIdentity, 'slug'), /^[a-z0-9-]+$/, 100),
    clientId = text(own(appIdentity, 'clientId'), /^[A-Za-z0-9_.-]+$/, 128), privateKey = own(appIdentity, 'privateKey');
  if (typeof privateKey !== 'string' || privateKey.length > 65536) fail();
  const http = createGitHubTransport({ repository: repo, fetcher, limits });
  const value = Object.freeze({ scope: 'captured-native-http-owner' });
  transports.set(value, { http, repository: repo, settings: jsonData({ slug, clientId }),
    makeApi: fetchBounded => native.makeApi(token, fetchBounded, { slug, clientId, privateKey }) });
  return value;
}
/** Trusted code-only lookup. Exposes bounded native GET functions and owned
 * public facts, never the credential, key or signed download URL.
 */
export function foottraceTransportPort(transport, limits) {
  const value = transports.get(transport); if (!value) fail();
  const view = value.http.createView(limits);
  return Object.freeze({ api: value.makeApi(view.fetch), repository: value.repository, settings: value.settings,
    registry: version => value.http.createRegistryView({ packageName: 'foottrace', version, ...(limits === undefined ? {} : { limits }) }).fetch,
    facts: view.facts, transportFacts: value.http.facts });
}

/** Trusted CODE-only exact metadata IO from the SAME captured credential owner.
 * No raw API/fetch, fresh client, credential or saved authority is returned.
 * Full native eligibility/writer admission and committed pre-effect/rechecks
 * remain the domain controller's responsibility before calling setExact().
 */
export function foottraceMetadataPatchPort(transport, input) {
  const value = transports.get(transport); if (!value) fail();
  try {
    const binding = jsonData(input, 128 * 1024);
    fields(binding, Object.hasOwn(binding, 'limits') ? ['pullNumber', 'desired', 'limits'] : ['pullNumber', 'desired']);
    id(binding.pullNumber);
    const exact = bindProposalMetadata(binding.desired, true),
      payload = Object.freeze({ title: exact.title, body: exact.body }),
      view = value.http.createExactPatchView(binding), api = value.makeApi(view.fetch),
      route = '/repos/' + value.repository.full_name + '/pulls/' + binding.pullNumber;
    return Object.freeze({ scope: 'exact-metadata-io-only', authorized: false,
      setExact: () => api('PATCH', route, payload), observation:view.observation, facts: view.facts, transportFacts: value.http.facts });
  } catch { fail(); }
}
