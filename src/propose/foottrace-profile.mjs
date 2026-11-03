import { isDeepStrictEqual } from 'node:util';
import archiveCodec from '../guards/release-archive.cjs';
import preparation from '../guards/release-prepare.cjs';
import { fields, jsonData } from '../eco/json-data.mjs';
import { admitHistoricalPreparationProducer } from './historical-producer.mjs';
import { own, keys, semanticText } from './source-inventory.mjs';
import { packageProfile } from './package-profile.mjs';

function artifactJson(bytes) {
  if (bytes.length > 1024 * 1024) throw new Error('artifact-json-budget');
  const text = preparation.decodeRaw(bytes), value = jsonData(JSON.parse(text));
  if (JSON.stringify(value) + '\n' !== text) throw new Error('artifact-json-shape');
  return value;
}
function prepareFromInventory({ inventory, date }) {
  const files = {}, fragments = {};
  for (const name of ['package.json', 'package-lock.json', 'CHANGELOG.md', 'README.md', 'docs/metadata.md'])
    files[name] = semanticText(inventory, name);
  for (const row of preparation.fragmentQueue(inventory))
    fragments[row.path.slice(9)] = semanticText(inventory, row.path);
  return preparation.prepareRelease({ files, fragments, date });
}
function readHistoricalEvidence(input) {
  try {
    keys(input, ['expected', 'run', 'job', 'artifact', 'archive']);
    const metadata = jsonData({ expected: own(input, 'expected'), run: own(input, 'run'),
      job: own(input, 'job'), artifact: own(input, 'artifact') });
    const archive = own(input, 'archive');
    const members = archiveCodec.readArtifactZip(archive, ['manifest.json', 'proposal.json']);
    const manifest = artifactJson(members['manifest.json']), proposal = artifactJson(members['proposal.json']);
    const producer = admitHistoricalPreparationProducer({ ...metadata, manifest });
    if (!producer.valid) throw new Error();
    fields(proposal, ['base', 'tree', 'repository', 'prepared']);
    if (proposal.base !== producer.binding.sourceSha || proposal.tree !== producer.binding.tree ||
        !isDeepStrictEqual(proposal.repository, metadata.expected.repository)) throw new Error();
    return Object.freeze({ valid: true, binding: producer.binding, prepared: proposal.prepared,
      artifactDigest: preparation.digest(archive), preparationDate: null });
  } catch { return Object.freeze({ valid: false, reason: 'historical-preparation-unavailable' }); }
}
/** Foottrace's actual manifest+proposal ZIP profile, not a schema for other packages. */
export function createFoottracePreparationProfile() {
  return packageProfile({ id: 'foottrace-next-v1', packageName: 'foottrace',
    originalParentLaw: 'published-predecessor', dateLaw: 'source-committer-day',
    prepare: prepareFromInventory, readHistoricalEvidence });
}

/** Reviewed native job/naming data for finite attempt classification only.
 * The eventual trusted driver passes this code-owned profile; no config/model
 * JSON or saved run may choose publication stages or writer authority.
 */
export function createFoottraceRetainedAttemptProfile() {
  return jsonData({ workflowPath: '.github/workflows/publish.yml', events: ['push', 'workflow_dispatch', 'release'],
    jobNames: ['plan', 'prepare', 'proposal', 'authority', 'verdict', 'gates', 'build', 'release', 'publish', 'verify'],
    effectJobNames: ['authority', 'release', 'publish'], prepareJobName: 'prepare', proposalJobName: 'proposal',
    completedJobNames: ['plan', 'prepare'], futureJobNames: ['authority', 'verdict', 'gates', 'build', 'release', 'publish', 'verify'],
    artifactNaming: { kind: 'producer-cohort', prefix: 'foottrace', role: 'prepare' } });
}

/** Explicit trusted native historical-witness naming/parent/date profile. */
export function createFoottracePendingWitnessProfile() {
  return jsonData({id:'foottrace-next-v1',workflowPath:'.github/workflows/publish.yml',prepareEvents:['push','workflow_dispatch'],
    prepareJobName:'prepare',artifactLayout:'run-attempt-job',artifactName:'foottrace',originalParentLaw:'published-predecessor',dateLaw:'source-committer-day'});
}

/** Exact retained workflow data shared by native bootstrap and inspection. */
export function createFoottraceWorkflowProfile() {
 const p=createFoottraceRetainedAttemptProfile();
 return jsonData({workflowPath:p.workflowPath,events:p.events,jobNames:p.jobNames,effectJobNames:p.effectJobNames});
}
