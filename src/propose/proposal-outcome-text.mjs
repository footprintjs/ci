const values=Object.freeze({
 'metadata-match':Object.freeze({output:'proposeOutcome=metadata-matched\n',
  summary:'### Propose metadata matched\n\nExact PR metadata was verified. Release readiness is unadmitted.\n'}),
 'metadata-hold':Object.freeze({output:'proposeOutcome=hold-metadata-stale\n',
  summary:'### Propose held\n\nReported metadata remains stale. Release readiness is unadmitted.\n'})
});
/** Closed text protocol only. A reported value is never terminal or effect authority. */
export function proposalOutcomeText(outcome){
 if(outcome!=='metadata-match'&&outcome!=='metadata-hold')throw new Error('proposal-output-unavailable');
 return values[outcome];
}
