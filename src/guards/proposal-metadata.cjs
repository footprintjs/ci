'use strict';
// One native text-policy owner for creation and exact metadata reconciliation.
function proposalMetadata(version, notes) {
  return { title: `Release ${version}`, body: `Release App proposal for foottrace ${version}.\n\n${notes}\nAfter Claude's independent merge verdict for this exact head is recorded publicly and all current runtime/tested-tree/CodeQL checks pass, reconcile main/head/tested tree. The owner may submit personally or explicitly authorize Codex or Claude to submit the real GitHub APPROVED review on this final head through the owner's existing authorized User account, distinct from the App author, with current API permission write or admin. A delegated review names the submitting agent and the owner's explicit authorization. Standing FootTrace authorization remains sufficient within its stated scope; a changed head still requires fresh independent review, current checks and a fresh approval. An exchange verdict or comment is not that approval. No independent review is waived. No workflow auto-approval is added. This App-authored PR does not publish until normally merged and the Release App route verifies its authority. Owner App installation and npm trusted-publisher setup remain prerequisites; see docs/RELEASING.md.` };
}
function proposalCreation(version, notes) {
  const metadata = proposalMetadata(version, notes);
  return { title: metadata.title, head: 'release/next', base: 'main', body: metadata.body };
}
module.exports = { proposalMetadata, proposalCreation };
