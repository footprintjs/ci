// Read the built file: its sha512 integrity and its size, from the bytes the step was given.
import { integrityOf } from '../../registry.mjs';

export const BUILT = Object.freeze({
  id: 'built',
  name: 'Read the built file',
  description: 'The integrity and size of package.tgz',
  make: ({ name, version, bytes }) => (scope) => {
    scope.packageName = name;
    scope.version = version;
    scope.localIntegrity = integrityOf(bytes);
    scope.localBytes = bytes.length;
  },
});
