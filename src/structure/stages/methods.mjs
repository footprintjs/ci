const callback = (index, returns, choice = null) => ({ mode: 'callback', index, returns, choice });
const handler = (index, returns) => ({ mode: 'handler', index, returns, choice: null });
const dictionary = entries => Object.freeze(Object.assign(Object.create(null), entries));

export const FACTORIES = dictionary({
  flowChart: { mode: 'root', index: 1, returns: 'builder', choice: null },
  flowChartSelector: callback(1, 'selector', 'select'),
});

export const METHODS = dictionary({
  start: { ...FACTORIES.flowChart, receivers: ['builder'] },
  startSelector: { ...FACTORIES.flowChartSelector, receivers: ['builder'] },
  addFunction: { ...callback(1, 'builder'), receivers: ['builder'] },
  addStreamingFunction: { ...callback(1, 'builder'), receivers: ['builder'] },
  addDeciderFunction: { ...callback(1, 'decider', 'either'), receivers: ['builder'] },
  addSelectorFunction: { ...callback(1, 'selector', 'select'), receivers: ['builder'] },
  addPausableFunction: { ...handler(1, 'builder'), receivers: ['builder'] },
  addFunctionBranch: { ...callback(2, 'same'), receivers: ['decider', 'selector'] },
  addPausableFunctionBranch: { ...handler(2, 'same'), receivers: ['decider', 'selector'] },
  addListOfFunction: { mode: 'list', index: 0, returns: 'builder', receivers: ['builder'] },
  addBranchList: { mode: 'list', index: 0, returns: 'same', receivers: ['decider', 'selector'] },
});

const passthrough = new Set(['addSubFlowChart', 'addSubFlowChartNext', 'addLazySubFlowChart',
  'addLazySubFlowChartNext', 'addParallelForEach', 'addDetachAndForget', 'addDetachAndJoinLater',
  'addRetryLoop', 'retry', 'touches', 'tag', 'budget', 'loopTo', 'setScopeFactory', 'attachStructureRecorder']);
const branch = new Set(['addSubFlowChartBranch', 'addLazySubFlowChartBranch']);

export function nextReceiver(name, kind) {
  const spec = METHODS[name];
  if (spec?.receivers.includes(kind)) return spec.returns === 'same' ? kind : spec.returns;
  if (name === 'end' && ['decider', 'selector'].includes(kind)) return 'builder';
  if (kind === 'builder' && name === 'build') return 'unrelated';
  if (kind === 'builder' && passthrough.has(name)) return kind;
  if (kind === 'decider' && ['setDefault', 'loopTo'].includes(name)) return kind;
  if (['decider', 'selector'].includes(kind) && branch.has(name)) return kind;
  return 'unknown';
}

export const frameworkOrigin = origin => origin?.module === 'footprintjs';
