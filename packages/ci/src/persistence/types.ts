export type { PersistenceConfig, TraceStorageConfig } from '../types';

export interface TraceEnvelope {
  version: string;
  timestamp: string;
  durationMs: number;
  flowId: string;
  footprintVersion: string;
  ciVersion: string;
  adapter: string;
  trigger: {
    event: string;
    ref?: string;
    sha?: string;
    actor?: string;
  };
  pipeline: {
    name: string;
    triggers: string[];
  };
  stages: unknown[];
  forks: unknown[];
  redactionReport?: {
    matchCount: number;
    patternsFired: string[];
    envVarsFired?: string[];
  };
  error?: {
    message: string;
    stack?: string;
  };
}
