import { admitSecurity } from "./guards/security-evidence.mjs";
import control from "./guards/release-control.cjs";
import archive from "./guards/release-archive.cjs";
import upstreamRuntime from "./guards/release-github.cjs";
const approved = new WeakSet();
const REQUIRED_GATES = Object.freeze(["check (22)", "check (24)", "tested-tree", "Analyze (actions)", "Analyze (javascript-typescript)"]);
const messages = {
  CONFIG_IDENTITY: "Evidence does not match the approved Foottrace identity.",
  INVALID_EVIDENCE: "Evidence is malformed or incomplete.",
  UNKNOWN_STAGE: "The stage is unsupported.",
  PLAN_READY: "Native planning admitted the complete source and publication history.",
  PLAN_VERIFY_ONLY: "The existing publication or uncertain attempt requires verification only.",
  PLAN_SKIP: "There is no release proposal to prepare.",
  PROPOSAL_READY: "Native proposal preflight admitted the complete input closure and retained history.",
  PROPOSAL_IDENTICAL: "The exact proposal already exists.",
  CI_REUSE: "The trusted latest CI attempt tested the exact merged tree.",
  SECURITY_REQUIRED: "The mandatory latest CodeQL run and both unique successful Analyze gates are required.",
  FULL_GATES_REQUIRED: "Both complete runtime gates must run; CI evidence cannot be reused.",
  AUTHORITY_READY: "Native authority and the uniform independent review profile are satisfied.",
  REVIEW_REQUIRED: "The exact-head independent public verdict and disclosed delegated approval are required.",
  ARTIFACT_READY: "The archive and producer binding satisfy native admission.",
  SUBMISSION_RESERVED: "A durable reservation is required before submission; this shadow cannot reserve or submit.",
  SUBMISSION_UNKNOWN: "A reservation or publication already exists; publication cannot be retried.",
  REGISTRY_CONFLICT: "Observed registry bytes conflict with the admitted archive.",
  GRANT_REQUIRED: "The exact current-attempt grant is required.",
  VERIFICATION_READY: "Native verification matched the published archive, tag, marker and release notes.",
  SHADOW_ONLY: "This stage requires a capability unavailable to read-only shadow execution."
};
for (const reason of ["identity", "event", "reviewed-tree", "incomplete", "app", "release-pr", "review-shape", "changes-requested", "approval", "invalid-evidence"]) messages[`authority-${reason}`] = "Native authority admission refused the evidence.";
const REASON_MESSAGES = Object.freeze(messages);
// Public catalog only. Admission uses the immutable messages and native code catalog.
const KNOWN_REASONS = new Set(Object.keys(REASON_MESSAGES));
const knownReasons = KNOWN_REASONS;
const reasonMessages = REASON_MESSAGES;
const readonlyCodes = new Set(["readonly-route", "readonly-method", "readonly-headers", "readonly-request-limit", "readonly-transport", "readonly-response", "readonly-redirect", "readonly-response-limit", "readonly-body", "readonly-json", "readonly-http"]);
function isKnownReason(value) {
  return typeof value === "string" && (Object.hasOwn(REASON_MESSAGES, value) || readonlyCodes.has(value) || upstreamRuntime.refusalCode({ code: value }) === value);
}
function isApprovedConfig(value) { return approved.has(value); }
function fail(code) {
  throw new Error(code);
}
function fields(value, names) {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) fail("CONFIG_INVALID");
  const d = Object.getOwnPropertyDescriptors(value), keys = Reflect.ownKeys(d);
  if (keys.length !== names.length || keys.some((k) => typeof k !== "string" || !names.includes(k)) || names.some((k) => !Object.hasOwn(d, k) || !Object.hasOwn(d[k], "value"))) fail("CONFIG_INVALID");
  return Object.fromEntries(names.map((k) => [k, d[k].value]));
}
function dataArray(value) {
  if (!Array.isArray(value)) fail("CONFIG_INVALID");
  const d = Object.getOwnPropertyDescriptors(value);
  if (Reflect.ownKeys(d).length !== value.length + 1 || value.length !== REQUIRED_GATES.length) fail("CONFIG_INVALID");
  return Array.from({ length: value.length }, (_, i) => {
    if (!d[i] || !Object.hasOwn(d[i], "value")) fail("CONFIG_INVALID");
    return d[i].value;
  });
}
function validateConfig(raw) {
  const c = fields(raw, ["schemaVersion", "profile", "repository", "package", "app", "workflow", "requiredGates"]);
  const repository = fields(c.repository, ["id", "full_name"]), app = fields(c.app, ["slug", "clientId"]), gates = dataArray(c.requiredGates);
  if (c.schemaVersion !== 1 || c.profile !== "foottrace-v1" || c.package !== "foottrace" || repository.full_name !== "footprintjs/foottrace" || !Number.isSafeInteger(repository.id) || repository.id <= 0 || c.workflow !== ".github/workflows/publish.yml" || typeof app.slug !== "string" || !/^[a-z0-9-]{1,100}$/.test(app.slug) || typeof app.clientId !== "string" || !/^[A-Za-z0-9_.-]{1,100}$/.test(app.clientId) || gates.some((g, i) => g !== REQUIRED_GATES[i])) fail("CONFIG_INVALID");
  const config = Object.freeze({ ...c, repository: Object.freeze(repository), app: Object.freeze(app), requiredGates: Object.freeze(gates) });
  approved.add(config);
  return config;
}
function result(outcome, reason, facts = {}) {
  const publicFacts = {};
  for (const [key, value] of Object.entries(facts)) {
    if (typeof value === "string" && value.length <= 200 && !/[\r\n]/.test(value)) publicFacts[key] = value;
    else if (typeof value === "boolean" || Number.isSafeInteger(value) && value >= 0) publicFacts[key] = value;
  }
  return Object.freeze({ outcome, reason, facts: Object.freeze(publicFacts) });
}
function identity(w, c) {
  return w?.expected?.package === c.package && control.sameRepo(w.expected.repository, c.repository);
}
function reviewProfile(review, head) {
  return review?.reviewer === "Claude" && review.verdict === "merge" && review.headSha === head && Number.isSafeInteger(review.publicRecord?.id) && review.publicRecord.id > 0 && review.publicRecord.headSha === head && review.publicRecord.disclosedDelegation === true;
}
/** Pure, shadow-only adapters over the exact production guards.
 * Native planning/history and verification run in the read-only collector.
 * Observations explain those checks; no result confers live effect authority.
 */
function evaluateStage(stage, facts, config) {
  if (!approved.has(config)) fail("CONFIG_UNAPPROVED");
  try {
    const w = facts?.world;
    if (stage === "authority") {
      if (!identity(w, config) || w.app?.expectedSlug !== config.app.slug || w.app?.expectedClientId !== config.app.clientId) return result("hold", "CONFIG_IDENTITY");
      const decision = control.decideAuthority(w);
      if (!decision.authorized) return result("hold", `authority-${decision.reason}`);
      if (!reviewProfile(facts.independentReview, w.expected.headSha)) return result("hold", "REVIEW_REQUIRED");
      // A public comment cannot disclose an otherwise undisclosed approval.
      // The effective eligible exact-head User approval must carry the disclosure.
      const effective = new Map();
      for (const r of [...w.reviews].sort((a, b) => a.id - b.id)) if (["APPROVED", "CHANGES_REQUESTED", "DISMISSED"].includes(r.state)) effective.set(r.user.id, r);
      if (![...effective.values()].some((r) => r.state === "APPROVED" && r.commit_id === w.expected.headSha && r.user.type === "User" && r.user.id !== w.pulls[0].user.id && w.reviewerPermissions.filter((p) => p.user?.id === r.user.id && p.user.login === r.user.login && ["write", "admin"].includes(p.permission)).length === 1 && typeof r.body === "string" && r.body.includes("Delegated approval") && r.body.includes("Claude") && r.body.includes(w.expected.headSha))) return result("hold", "REVIEW_REQUIRED");
      return result("pass", "AUTHORITY_READY", { headSha: w.expected.headSha, tree: w.expected.tree, pr: w.expected.pr });
    }
    if (stage === "verdict") {
      if (!identity(w, config)) return result("hold", "CONFIG_IDENTITY");
      if (!admitSecurity(facts.security, w.expected, config.requiredGates.slice(3))) return result("hold", "SECURITY_REQUIRED");
      const decision = control.decideCiReuse(w);
      return decision.tested ? result("pass", "CI_REUSE", { runId: decision.runId, attempt: decision.attempt }) : result("hold", "FULL_GATES_REQUIRED");
    }
    if (stage === "build") {
      if (w?.expected?.package !== config.package || w.expected.repositoryId !== config.repository.id) return result("hold", "CONFIG_IDENTITY");
      if (!control.validateArtifactBinding(w).valid) return result("hold", "INVALID_EVIDENCE");
      const checked = archive.inspectArchive(facts.bytes, { package: w.expected.package, version: w.expected.version });
      if (!["sha256", "integrity", "shasum"].every((k) => w.manifest[k] === checked[k])) return result("hold", "INVALID_EVIDENCE");
      return result("pass", "ARTIFACT_READY", { sha256: checked.sha256, artifactId: w.expected.artifactId });
    }
    if (stage === "publish") {
      if (!w?.expected || typeof w.expected.integrity !== "string") return result("hold", "INVALID_EVIDENCE");
      const decision = control.decideSubmission(w);
      if (decision.action === "hold") return result("hold", "REGISTRY_CONFLICT");
      if (decision.action === "verify-only") return result("verify-only", "SUBMISSION_UNKNOWN");
      // v1 cannot reserve, submit or retry, even if a caller supplies a grant.
      return result("would-write", "SUBMISSION_RESERVED");
    }
    if (stage === "plan") {
      const p = facts?.plan;
      if (!p || p.package !== config.package || !control.sameRepo(p.repository, config.repository) || !control.validSha(p.sha) || !control.validSha(p.tree) || !/^\d+\.\d+\.\d+$/.test(p.version)) return result("hold", "INVALID_EVIDENCE");
      if (p.mode === "verify") return result("verify-only", "PLAN_VERIFY_ONLY", { sha: p.sha, tree: p.tree, version: p.version });
      if (["prepare", "publish"].includes(p.mode)) return result("pass", "PLAN_READY", { sha: p.sha, tree: p.tree, version: p.version, mode: p.mode });
      return result("hold", "INVALID_EVIDENCE");
    }
    if (stage === "propose") {
      const p = facts?.preflight;
      if (!p || !control.sameRepo(p.rebuilt?.repository, config.repository) || !control.validSha(p.expectedTree) || !["no-op", "rollover", "create"].includes(p.state?.action) || p.state.force !== false) return result("hold", "INVALID_EVIDENCE");
      return p.state.action === "no-op" ? result("skip", "PROPOSAL_IDENTICAL") : result("would-write", "PROPOSAL_READY", { tree: p.expectedTree });
    }
    if (stage === "verify") {
      const v = facts?.verification;
      if (v?.state === "verified" && control.validSha(v.sha) && /^[a-f0-9]{64}$/.test(v.sha256) && typeof v.integrity === "string" && /^sha512-[A-Za-z0-9+/]+={0,2}$/.test(v.integrity)) return result("pass", "VERIFICATION_READY", { sha: v.sha, sha256: v.sha256, version: v.version });
      if (["pending-release", "pending-registry", "pending-latest"].includes(v?.state)) return result("verify-only", "SUBMISSION_UNKNOWN");
      return result("hold", "INVALID_EVIDENCE");
    }
    return result("hold", "UNKNOWN_STAGE");
  } catch {
    return result("hold", "INVALID_EVIDENCE");
  }
}
export {
  KNOWN_REASONS,
  REASON_MESSAGES,
  REQUIRED_GATES,
  evaluateStage,
  isKnownReason,
  isApprovedConfig,
  knownReasons,
  reasonMessages,
  upstreamRuntime,
  validateConfig
};
