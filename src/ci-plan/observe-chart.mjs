import { FlowChartExecutor, decide, flowChart } from 'footprintjs';
import { controlDepRecorder } from 'footprintjs/trace';
import { createPlanRules } from './plan-rules.mjs';

export async function runObserveChart(gather, isVerifiedReceipt) {
  const { planCell, observeCell } = createPlanRules({ isVerifiedReceipt });
  let input;
  const chart = flowChart('Gather CI facts', async scope => {
    input = await gather();
    scope.factCount = input.cells.length;
  }, 'gather-ci-facts')
    .addDeciderFunction('Apply reuse rules to each check cell', scope => {
      const decisions = input.cells.map(cell => {
        const candidate = planCell(input.facts, cell);
        return input.actualByCell?.[cell.id] ? observeCell(candidate, input.actualByCell[cell.id]) : candidate;
      });
      scope.decisions = decisions;
      scope.proposals = decisions.filter(cell => cell.decision === 'would-skip').length;
      return decide(scope, [{
        when: { proposals: { gt: 0 } },
        then: 'observe-proposals',
        label: 'At least one check has sufficient evidence for a proposal',
      }], { branch: 'run-all', label: 'No check has sufficient evidence for a proposal' });
    }, 'decide-check-cells')
      .addFunctionBranch('observe-proposals', 'Record proposed omissions', scope => { scope.route = 'observed'; })
      .addFunctionBranch('run-all', 'Record that every check runs', scope => { scope.route = 'run-all'; })
      .setDefault('run-all')
      .end()
    .build();
  const executor = new FlowChartExecutor(chart);
  const control = controlDepRecorder();
  executor.attachCombinedRecorder(control);
  executor.setReadTracking('full');
  await executor.run();
  const snapshot = executor.getSnapshot();
  const { decisions, route } = snapshot.sharedState;
  if (!Array.isArray(decisions) || !route) throw new Error('No observe plan was recorded');
  return {
    schema: 1, mode: 'observe', enforcement: false,
    ...input.context, route, decisions,
    chart: { runId: snapshot.runId, decisions: control.getDecisions() },
  };
}
