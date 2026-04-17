import type { CombinedNarrativeEntry, RuntimeSnapshot } from 'footprintjs';
import type { FlowchartCheckpoint } from 'footprintjs';

export type { PersistenceConfig, TraceStorageConfig } from '../types';

/**
 * The on-disk JSON shape for a pipeline trace.
 *
 * The `narrative`, `narrativeEntries`, and `snapshot` fields come straight
 * from FootPrint's `FlowChartExecutor` — they're the whole point of this
 * library. Consumers can feed them into the FootPrint playground for
 * replay and debugging.
 */
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
    ref?: string | undefined;
    sha?: string | undefined;
    actor?: string | undefined;
  };
  pipeline: {
    name: string;
    triggers: string[];
  };
  /** Human-readable causal trace from FootPrint. */
  narrative: string[];
  /** Structured narrative entries for programmatic consumers. */
  narrativeEntries: CombinedNarrativeEntry[];
  /** Full `RuntimeSnapshot` from `FlowChartExecutor.getSnapshot()`. */
  snapshot: RuntimeSnapshot | null;
  /** Present iff the run was paused via a PausableHandler. */
  paused?: boolean;
  checkpoint?: FlowchartCheckpoint | undefined;
  error?: {
    message: string;
    stack?: string | undefined;
  };
}
