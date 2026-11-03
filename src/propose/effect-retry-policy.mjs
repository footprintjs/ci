const kinds=Object.freeze({
 'set-pr-metadata':'idempotent-exact-value',
 'create-blob':'non-repeatable-after-uncertainty',
 'create-tree':'non-repeatable-after-uncertainty',
 'create-commit':'non-repeatable-after-uncertainty',
 'move-ref':'non-repeatable-after-uncertainty',
 'create-pr':'non-repeatable-after-uncertainty',
 publish:'non-repeatable-after-uncertainty'
});
/** C1 classification only. This is policy DATA, never admission or permission.
 * No saved outcome or prior invocation state enters. The actual native effect
 * flow must still verify every fresh predicate and commit before one mutation.
 */
export function effectRetryPolicy(effect) {
 if(typeof effect!=='string'||!Object.hasOwn(kinds,effect))throw new Error('proposal-effect-unavailable');
 return Object.freeze({effect,retrySafety:kinds[effect],afterUncertain:'get-verify-only',
  retryWithinInvocation:false,freshLaterInvocation:effect==='set-pr-metadata'?'fresh-eligibility-once':'get-verify-only',
  authorized:false});
}
