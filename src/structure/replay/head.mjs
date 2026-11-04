import { checkedObjectId } from './grammar.mjs';

export function checkedHead(head) {
  if (!head || !Array.isArray(head.parents) || !Array.isArray(head.entries)) throw new TypeError('Invalid merge head input.');
  const width = checkedObjectId(head.id).length;
  checkedObjectId(head.tree, width);
  for (const parent of head.parents) checkedObjectId(parent, width);
  if (new Set(head.parents).size !== head.parents.length) throw new TypeError('Duplicate merge parent.');
  return width;
}

export function checkedAttributeTrees(head) {
  const expected = new Set([head.id, ...head.parents]);
  const trees = head.attributeTrees;
  if (!Array.isArray(trees) || trees.length !== 3) throw new TypeError('Merge replay requires three explicit attribute trees.');
  const observed = new Set();
  for (const tree of trees) {
    if (!tree || !expected.has(tree.id) || observed.has(tree.id)) throw new TypeError('Attribute tree identities do not match merge input.');
    observed.add(tree.id);
  }
  if (observed.size !== expected.size) throw new TypeError('Attribute trees do not cover the merge input.');
  return trees;
}
