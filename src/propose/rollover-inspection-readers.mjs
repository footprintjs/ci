import {id} from '../eco/json-data.mjs';
import {foottraceInvocationContext} from './foottrace-context.mjs';
import {foottraceTransportPort} from './foottrace-transport.mjs';
import {createFoottraceCurrentInputReader} from './foottrace-current-inputs.mjs';
import {createFoottraceProposerReader,createFoottraceProposerObservation} from './current-proposer.mjs';
import {createFoottraceCurrentPreparationReader} from './current-preparation.mjs';
import {createFoottraceRolloverInputReader} from './foottrace-rollover-inputs.mjs';
import {createFoottraceWorkflowProfile,createFoottraceRetainedAttemptProfile} from './foottrace-profile.mjs';
import {createRetainedWorkflowReader} from './retained-workflows.mjs';
import {createRetainedSourceVersionReader} from './retained-source-versions.mjs';
import {createRetainedAttemptAssessor} from './retained-attempts.mjs';
import {createFoottraceCandidatePublicationReader} from './candidate-publication.mjs';
import {createFoottraceLineageObservationReader} from './foottrace-lineage.mjs';
/** Fixed CODE ports shared by ordinary pre-ref and post-ref INPUT readers.
 * No DATA callbacks, copied history engine or changed native predicate.
 */
export function createFoottraceOrdinaryReaders({transport,context,artifactId}){
 const pinned=foottraceInvocationContext(context),port=foottraceTransportPort(transport);id(artifactId);
 const profile=createFoottraceWorkflowProfile();
 return Object.freeze({
  source:createFoottraceCurrentInputReader({transport,context:pinned}),
  current:createFoottraceProposerReader({transport,context:pinned}),
  archive:createFoottraceCurrentPreparationReader({api:port.api,context:pinned,artifactId,
   readCurrentProposer:createFoottraceProposerObservation({transport,context:pinned})}),
  rollover:createFoottraceRolloverInputReader({transport,context:pinned}),
  published:createFoottraceLineageObservationReader({transport:port,context:{repository:pinned.repository,sha:pinned.sha},settings:port.settings}),
  workflows:createRetainedWorkflowReader({api:port.api,repository:port.repository,profile}),
  versions:createRetainedSourceVersionReader({api:port.api,repository:port.repository,packageName:'foottrace',profile,candidateScope:'current-target'}),
  assess:createRetainedAttemptAssessor(createFoottraceRetainedAttemptProfile()),
  candidate:createFoottraceCandidatePublicationReader({api:port.api,registry:port.registry,repository:port.repository,candidateScope:'current-target'})
 });
}
