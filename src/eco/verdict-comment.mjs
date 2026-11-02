import { createHash } from 'node:crypto';
const MARKER = '<!-- footprint-verdict v1 -->';
const KEYS = new Set(['Reviewer','Verdict','Action','Head','Base','Tree','Scope']);
const VERDICTS = new Set(['merge','changes','hold']);
const ACTIONS = new Set(['merge-source','release','policy']);
const malformed = () => Object.freeze({ kind: 'malformed' });
const digest = value => createHash('sha256').update(value).digest('hex');

/** Parse syntax, never principal, policy, history, checks or effect authority.
 * Scope and free-form footer stay opaque: only digests/byte counts are returned.
 * A caller must separately admit the actual provider principal, prior policy,
 * observed push/order/body history and current head/base/tree/action/checks.
 */
export function parseVerdictComment(body) {
  if (typeof body !== 'string' || Buffer.byteLength(body,'utf8') > 64 * 1024) return malformed();
  if (!body.includes(MARKER)) return Object.freeze({ kind: 'not-verdict' });
  if (body.split(MARKER).length !== 2) return malformed();
  const lines = body.replace(/\r\n/g,'\n').split('\n');
  if (lines[0] !== MARKER) return malformed();
  const values = new Map();
  const add = (key,value) => {
    if (!KEYS.has(key) || values.has(key) || !value || value !== value.trim() || /[\x00-\x1f\x7f]/.test(value)) return false;
    values.set(key,value); return true;
  };
  let count = 0;
  for (const line of lines.slice(1)) {
    if (!line) break; // Full review text follows the bounded header after a blank line.
    if (++count > 7) return malformed();
    if (/^(?:Head|Base|Tree):/.test(line)) {
      let rest = line;
      while (rest) {
        const match = /^(Head|Base|Tree): ([a-f0-9]{40})(?:[ \t]+|$)/.exec(rest);
        if (!match || !add(match[1],match[2])) return malformed();
        rest = rest.slice(match[0].length);
      }
    } else {
      const match = /^(Reviewer|Verdict|Action|Scope): (.+)$/.exec(line);
      if (!match || !add(match[1],match[2])) return malformed();
    }
  }
  if (values.size !== KEYS.size || values.get('Reviewer') !== 'Claude' ||
      !VERDICTS.has(values.get('Verdict')) || !ACTIONS.has(values.get('Action')) ||
      Buffer.byteLength(values.get('Scope'),'utf8') > 1024) return malformed();
  const verdict = Object.freeze({ reviewer:'Claude', verdict:values.get('Verdict'), action:values.get('Action'),
    head:values.get('Head'), base:values.get('Base'), tree:values.get('Tree'),
    scope:Object.freeze({ sha256:digest(values.get('Scope')), bytes:Buffer.byteLength(values.get('Scope'),'utf8') }) });
  return Object.freeze({ kind:'parsed', verdict, bodySha256:digest(body) });
}
