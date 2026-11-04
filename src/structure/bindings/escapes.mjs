import { bindingUses } from './uses.mjs';

/** The same prior-external-use law, answered from the file's earliest escape. */
export function escapedBefore(declaration, reference) {
  return (bindingUses(declaration.getSourceFile()).escapeOffsets.get(declaration) ?? Infinity) < reference.getStart();
}
