import ts from 'typescript';

/** Syntactic block-body statements, including nested bodies; no work or cost claim. */
export function countStatements(callable) {
  if (!callable.body || !ts.isBlock(callable.body)) return 0;
  let count = 0;
  const visit = node => {
    if (ts.isStatement(node) && !ts.isBlock(node) && !ts.isEmptyStatement(node)) count++;
    ts.forEachChild(node, visit);
  };
  visit(callable.body);
  return count;
}
