// Run a built chart the way the route runs every chart: full read tracking and per-write read
// provenance (so the record answers "what was read before this write"), the control-dependence
// recorder (so a value is walked back to the decision that let its stage run), and the narrative
// (the story printed to the job summary). A run that throws keeps what it committed: the snapshot
// is taken either way, and the error comes back beside it, never swallowed.
import { FlowChartExecutor } from 'footprintjs';
import { controlDepRecorder } from 'footprintjs/trace';

export async function execute(chart) {
  const executor = new FlowChartExecutor(chart, { readTracking: 'full', writeProvenance: 'reads-prefix', commitValues: 'full' });
  const control = controlDepRecorder({ id: 'control' });
  executor.attachCombinedRecorder(control);
  executor.enableNarrative();
  let failure = null;
  try {
    await executor.run();
  } catch (error) {
    failure = { error };
  }
  return { snapshot: executor.getSnapshot(), control, narrative: executor.getNarrativeEntries(), failure };
}
