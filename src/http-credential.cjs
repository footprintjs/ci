'use strict';
// Opaque bounded credential bytes; no token-format parsing or authority claim.
function isOpaqueCredential(value) {
  return typeof value === 'string' && value.length > 0 && value.length <= 8192 && !/[^\x21-\x7E]/.test(value);
}
module.exports = { isOpaqueCredential };
