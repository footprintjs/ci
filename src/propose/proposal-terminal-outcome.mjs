const outcomes=Object.freeze({
 'metadata-only':Object.freeze({'metadata-match':'metadata-match','metadata-hold':'metadata-hold'}),
 'ref-refresh':Object.freeze({'metadata-reconciled':'metadata-match','metadata-hold':'metadata-hold','refresh-verify-only':'proposal-verify-only'}),
 ordinary:Object.freeze({'rollover-proposed':'metadata-match','rollover-proposal-verify-only':'proposal-verify-only'})
});
/** Closed report DATA only. The owning native entry must independently prove
 * its actual selected and whole terminals before any local output. No status
 * supplied through DATA, persisted output or mapping result grants authority.
 */
export function wholeProposalTerminalOutcome(route,status,source){
 if(typeof route!=='string'||typeof status!=='string'||!Object.hasOwn(outcomes,route)||!Object.hasOwn(outcomes[route],status))
  throw new Error('proposal-terminal-outcome-unavailable');
 if(!source||typeof source!=='object'||Array.isArray(source)||source.authorized!==false||source.releaseReady!==false)
  throw new Error('proposal-terminal-outcome-unavailable');
 let valid=false;
 if(route==='metadata-only')valid=source.verified===true&&source.status===(status==='metadata-match'?'match':'held');
 if(route==='ref-refresh')valid=source.status===(status==='metadata-reconciled'?'match':'held')&&
  source.metadataVerified===(status!=='refresh-verify-only')&&source.mergeReleaseGatesStillRequired===true;
 if(route==='ordinary')valid=source.status===(status==='rollover-proposed'?'proposed':'held')&&source.mergeReleaseGatesStillRequired===true&&
  (status==='rollover-proposed'?(source.prSubmission==='acknowledged'&&source.prCreated===true&&source.prObserved===true):
   ['not-attempted','uncertain'].includes(source.prSubmission));
 if(!valid)throw new Error('proposal-terminal-outcome-unavailable');
 return outcomes[route][status];
}
