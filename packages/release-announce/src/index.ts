export { releaseAnnounce } from './module.js';
export type { AnnounceState, ReleaseAnnounceOptions } from './module.js';

export { parseChangelog } from './changelog-parser.js';
export type { ParsedChangelog } from './changelog-parser.js';

export { renderTemplate, truncate } from './templates.js';
export type { TemplateInput, TemplateName, TemplateOutput } from './templates.js';

export { twitterAdapter } from './platforms/twitter.js';
export { linkedinAdapter } from './platforms/linkedin.js';
export { devtoAdapter } from './platforms/devto.js';

export {
  isMajorVersion,
  reviewBranchFor,
  waitForApproval,
} from './review-gate.js';
export type { ReviewMode, WaitForApprovalOptions } from './review-gate.js';

export type {
  FormattedContent,
  PlatformAdapter,
  PlatformLimits,
  PlatformName,
  PostResult,
} from './platforms/types.js';
