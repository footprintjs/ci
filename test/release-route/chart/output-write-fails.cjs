// Loaded with `node --require` by step-end-bundle.test.mjs: the disk fills while the step writes
// $GITHUB_OUTPUT. On the descriptor opened on that file, the first write takes all but the last 3
// bytes and the next one fails with ENOSPC, as a full disk does. Every other file is untouched.
const fs = require('node:fs');
const open = fs.openSync;
const write = fs.writeSync;
let output = null;
let writes = 0;
fs.openSync = function (path, ...rest) {
  const fd = open.call(this, path, ...rest);
  if (String(path) === process.env.GITHUB_OUTPUT) output = fd;
  return fd;
};
fs.writeSync = function (fd, buffer, offset, length, ...rest) {
  if (fd !== output) return write.call(this, fd, buffer, offset, length, ...rest);
  if (++writes > 1) throw Object.assign(new Error('ENOSPC: no space left on device, write'), { code: 'ENOSPC' });
  return write.call(this, fd, buffer, offset, length - 3);
};
