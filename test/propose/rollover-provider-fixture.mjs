import {proposalBootstrapFixture} from './proposal-bootstrap-provider-fixture.mjs';
import {createFoottraceCurrentInputReader} from '../../src/propose/foottrace-current-inputs.mjs';
/** Independent synthetic ordinary world, established BEFORE production reads:
 * no historical pending PR/run exists; release/next is exactly published L.
 * Current native producer/archive/source stay unchanged, never relabelled.
 */
export async function rolloverFixture(options={}){
 const f=await proposalBootstrapFixture({retainedJobs:'full-native',...options});
 f.f.pulls.splice(0,f.f.pulls.length,...f.f.pulls.filter(p=>p.number!==f.pending.number));
 f.cohorts.splice(0,f.cohorts.length,...f.cohorts.filter(c=>c.run.id!==456));
 f.f.tip=f.f.originalHead;
 const input=await createFoottraceCurrentInputReader({transport:f.transport,context:f.fullContext})();
 if(!input.valid)throw new Error('ordinary fixture current input unavailable');
 return {...f,prepared:input.prepared};
}
