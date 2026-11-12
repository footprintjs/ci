// An evaluator for the FEW expression forms the route workflows' `if:` conditions use, so the
// truth table of the jobs is computed from the YAML, not written beside it. Anything else is
// refused, which keeps the forms few: a new form needs this file changed and reviewed.
//
//   condition := '${{' or '}}'
//   or        := and ('||' and)*
//   and       := not ('&&' not)*
//   not       := '!cancelled()' | '(' or ')' | 'cancelled()' | path '==' 'literal'
//   path      := needs.<job>.result | needs.<job>.outputs.<name> | steps.<id>.outputs.<name>
//
// `!` is accepted ONLY directly before cancelled(): GitHub gives `!` a higher precedence than `==`
// (`!needs.x.result == 'failure'` reads `(!'success') == 'failure'`, always false), and an evaluator
// that read it the other way would compute a truth table GitHub does not run.
// GitHub compares strings without regard to letter case; so does this (every value here is a
// lowercase word of a closed alphabet anyway). A missing output (a skipped job has none) is ''.
// Source of the job-level rules modelled by the callers: GitHub's expressions reference, "Status
// check functions" ("A default status check of success() is applied unless you include one of
// these functions"; for a job that must run whatever came before, the page recommends
// `if: ${{ !cancelled() }}`), and the contexts reference (needs.<job_id>.result is success,
// failure, cancelled or skipped).

const TOKEN = /\s*(?:(\|\||&&|==|!|\(|\))|(cancelled\(\))|'([a-z0-9-]*)'|((?:needs|steps)\.[a-z][a-z0-9-]*\.(?:result|outputs\.[a-z][a-z0-9-]*)))/y;

export function tokens(condition) {
  const match = /^\$\{\{ (.*) \}\}$/.exec(condition);
  if (!match) throw new Error(`not a \${{ }} condition: ${condition}`);
  const body = match[1];
  const out = [];
  TOKEN.lastIndex = 0;
  while (TOKEN.lastIndex < body.length) {
    const start = TOKEN.lastIndex;
    const found = TOKEN.exec(body);
    if (!found) throw new Error(`a form this evaluator does not know at "${body.slice(start)}"`);
    if (found[1]) out.push({ op: found[1] });
    else if (found[2]) out.push({ call: 'cancelled' });
    else if (found[3] !== undefined) out.push({ literal: found[3] });
    else out.push({ path: found[4] });
  }
  return out;
}

// The AST of a condition: { or: [...] } | { and: [...] } | { not } | { cancelled: true } | { path, equals }.
export function parseCondition(condition) {
  const list = tokens(condition);
  let at = 0;
  const peek = () => list[at];
  const take = (op) => {
    if (peek()?.op !== op) throw new Error(`expected ${op} in ${condition}`);
    at++;
  };
  const or = () => {
    const parts = [and()];
    while (peek()?.op === '||') { at++; parts.push(and()); }
    return parts.length === 1 ? parts[0] : { or: parts };
  };
  const and = () => {
    const parts = [not()];
    while (peek()?.op === '&&') { at++; parts.push(not()); }
    return parts.length === 1 ? parts[0] : { and: parts };
  };
  const not = () => {
    const token = list[at++];
    if (token?.op === '!') {
      if (list[at]?.call !== 'cancelled') throw new Error(`"!" before something other than cancelled() in ${condition}`);
      at++;
      return { not: { cancelled: true } };
    }
    if (token?.op === '(') { const inner = or(); take(')'); return inner; }
    if (token?.call === 'cancelled') return { cancelled: true };
    if (token?.path) {
      take('==');
      const value = list[at++];
      if (value?.literal === undefined) throw new Error(`a comparison with something other than a literal in ${condition}`);
      return { path: token.path, equals: value.literal };
    }
    throw new Error(`unexpected ${JSON.stringify(token)} in ${condition}`);
  };
  const tree = or();
  if (at !== list.length) throw new Error(`left over after the condition: ${condition}`);
  return tree;
}

// world: { cancelled: boolean, needs: { job: { result, outputs } }, steps: { id: { outputs } } }.
export function evaluate(tree, world) {
  if (tree.or) return tree.or.some((part) => evaluate(part, world));
  if (tree.and) return tree.and.every((part) => evaluate(part, world));
  if (tree.not) return !evaluate(tree.not, world);
  if (tree.cancelled) return world.cancelled === true;
  const [scope, name, field, output] = tree.path.split('.');
  const holder = (scope === 'needs' ? world.needs : world.steps)?.[name];
  if (scope === 'needs' && !holder) throw new Error(`${tree.path}: ${name} is not a job this one needs`);
  const value = field === 'result' ? holder?.result : holder?.outputs?.[output];
  return String(value ?? '').toLowerCase() === tree.equals.toLowerCase();
}

// Every path a condition reads.
export function pathsOf(tree) {
  if (tree.or) return tree.or.flatMap(pathsOf);
  if (tree.and) return tree.and.flatMap(pathsOf);
  if (tree.not) return pathsOf(tree.not);
  return tree.path ? [tree.path] : [];
}
