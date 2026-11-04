const values=Object.freeze({
 'metadata-match':Object.freeze({name:'metadata-matched',output:'proposeOutcome=metadata-matched\n',
  summary:'### Propose metadata matched\n\nExact PR metadata was verified. Release readiness is unadmitted.\n'}),
 'metadata-hold':Object.freeze({name:'hold-metadata-stale',output:'proposeOutcome=hold-metadata-stale\n',
  summary:'### Propose held\n\nReported metadata remains stale. Release readiness is unadmitted.\n'}),
 'proposal-verify-only':Object.freeze({name:'hold-proposal-uncertain',output:'proposeOutcome=hold-proposal-uncertain\n',
  summary:'### Propose held\n\nA proposal submission remains uncertain. Continue GET-only verification; release readiness is unadmitted.\n'})
});
/** Closed text protocol only. A reported value is never terminal or effect authority. */
export function proposalOutcomeText(outcome){
 if(typeof outcome!=='string'||!Object.hasOwn(values,outcome))throw new Error('proposal-output-unavailable');
 return values[outcome];
}
