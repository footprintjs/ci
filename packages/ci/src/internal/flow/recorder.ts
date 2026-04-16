import type { FlowRecord, ForkTrace, StageTrace } from './types';

export class FlowRecorder {
  private stages: StageTrace[] = [];
  private forks: ForkTrace[] = [];

  recordStage(entry: StageTrace): void {
    this.stages.push(entry);
  }

  recordFork(entry: ForkTrace): void {
    this.forks.push(entry);
  }

  export(): FlowRecord {
    return {
      stages: this.stages.slice(),
      forks: this.forks.slice(),
    };
  }
}
