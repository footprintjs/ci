import { bindingUses } from './uses.mjs';

export function hasExplicitWrite(declaration) {
  return bindingUses(declaration.getSourceFile()).writes.has(declaration);
}
