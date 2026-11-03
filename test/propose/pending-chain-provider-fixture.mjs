import {createRequire} from 'node:module';
import {preparationWitnessFixture} from './preparation-witness-fixture.mjs';
import {sourceFixture} from './prepared-fixtures.mjs';
import {zip} from './artifact-fixture.mjs';
const require=createRequire(import.meta.url),preparation=require('../../src/guards/release-prepare.cjs');
export function chainFixture(count = 2, changeSource = () => {}) {
  const witnesses = [];
  for (let i = 0; i < count; i++) {
    const source = sourceFixture(); changeSource(source, i);
    source.commit.tree.sha = preparation.treeOid(source.inventory);
    const w = preparationWitnessFixture(p => p, source);
    w.originalSource.commit.sha = (i + 10).toString(16).padStart(40, '0');
    w.pendingSource.commit.sha = (i + 100).toString(16).padStart(40, '0');
    w.pendingSource.commit.parents[0].sha = w.originalSource.commit.sha;
    if (i) w.pendingSource.commit.parents[1].sha = witnesses[i - 1].pendingSource.commit.sha;
    w.evidence.expected.sourceSha = w.originalSource.commit.sha;
    w.evidence.run.head_sha = w.evidence.expected.sourceSha; w.evidence.job.head_sha = w.evidence.expected.sourceSha;
    w.evidence.artifact.workflow_run.head_sha = w.evidence.expected.sourceSha;
    const oldMembers = preparationFixtureMembers(w.evidence.archive);
    w.evidence.expected.runId += i; w.evidence.run.id = w.evidence.expected.runId; w.evidence.job.run_id = w.evidence.expected.runId;
    w.evidence.artifact.workflow_run.id = w.evidence.expected.runId; oldMembers.manifest.runId = w.evidence.expected.runId;
    w.evidence.expected.jobId += i; w.evidence.job.id = w.evidence.expected.jobId; oldMembers.manifest.jobId = w.evidence.expected.jobId;
    w.evidence.expected.artifactId += i; w.evidence.artifact.id = w.evidence.expected.artifactId;
    w.evidence.expected.artifactName = `foottrace-123-${w.evidence.expected.runId}-1-prepare`;
    w.evidence.artifact.name = w.evidence.expected.artifactName;
    oldMembers.manifest.sourceSha = w.evidence.expected.sourceSha;
    oldMembers.proposal.base = w.evidence.expected.sourceSha;
    w.evidence.archive = zip([['manifest.json', JSON.stringify(oldMembers.manifest) + '\n'],
      ['proposal.json', JSON.stringify(oldMembers.proposal) + '\n']]);
    witnesses.push(w);
  }
  return { witnesses, predecessor: witnesses[0].predecessor };
}
export function preparationFixtureMembers(archive) {
  const codec = require('../../src/guards/release-archive.cjs');
  const members = codec.readArtifactZip(archive, ['manifest.json', 'proposal.json']);
  return { manifest: JSON.parse(members['manifest.json']), proposal: JSON.parse(members['proposal.json']) };
}

