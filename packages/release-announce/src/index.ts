export { releaseAnnounce } from './module';
export type { ReleaseAnnounceOptions } from './module';

export { parseChangelog } from './changelog-parser';
export type { ParsedChangelog } from './changelog-parser';

export { renderTemplate, truncate } from './templates';
export type { TemplateInput, TemplateName, TemplateOutput } from './templates';

export { twitterAdapter } from './platforms/twitter';
export { linkedinAdapter } from './platforms/linkedin';
export { devtoAdapter } from './platforms/devto';

export { isMajorVersion, reviewBranchFor, waitForApproval } from './review-gate';
export type { ReviewMode, WaitForApprovalOptions } from './review-gate';

export type {
  FormattedContent,
  PlatformAdapter,
  PlatformLimits,
  PlatformName,
  PostResult,
} from './platforms/types';
