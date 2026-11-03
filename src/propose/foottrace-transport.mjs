import {isOpaqueCredential} from '../http-credential.cjs';
import native from '../guards/release-github.cjs';
import { jsonData, fields, id, text } from '../eco/json-data.mjs';
import { own } from './source-inventory.mjs';
import { createGitHubGetTransport } from './github-get-transport.mjs';
const transports = new WeakMap();
const fail = () => { throw new Error('foottrace-read-transport-unavailable'); };
/** Runtime-only private native API closure. This is a GET transport, never a
 * writer grant. No saved/model JSON can supply its opaque brand or code port.
 */
export function createFoottraceTransport({ repository, token, appIdentity, fetcher, limits } = {}) {
  const repo = fields(jsonData(repository), ['id', 'full_name']); id(repo.id);
  if (repo.full_name !== 'footprintjs/foottrace') fail();
  // Credentials are opaque. Bound safe header bytes without parsing legacy or JWT formats.
  if (!isOpaqueCredential(token)) fail();
  const slug = text(own(appIdentity, 'slug'), /^[a-z0-9-]+$/, 100),
    clientId = text(own(appIdentity, 'clientId'), /^[A-Za-z0-9_.-]+$/, 128), privateKey = own(appIdentity, 'privateKey');
  if (typeof privateKey !== 'string' || privateKey.length > 65536) fail();
  const http = createGitHubGetTransport({ repository: repo, fetcher, limits });
  const value = Object.freeze({ readOnly: true });
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
