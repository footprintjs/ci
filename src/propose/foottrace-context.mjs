import {fields,jsonData,id} from '../eco/json-data.mjs';
import control from '../guards/release-control.cjs';
/** Detached actual native invocation context. Validation precedes every
 * production discovery request; this shape grants no producer authority. */
export function foottraceInvocationContext(context) {
 const p=fields(jsonData(context),['repository','sha','runId','runAttempt','eventName','ref']);
 fields(p.repository,['id','full_name']);id(p.repository.id);id(p.runId);id(p.runAttempt);
 if(p.repository.full_name!=='footprintjs/foottrace'||!control.validSha(p.sha)||p.runAttempt>8||
  !['push','workflow_dispatch'].includes(p.eventName)||p.ref!=='refs/heads/main')
  throw new Error('foottrace-invocation-context-unavailable');
 return p;
}
