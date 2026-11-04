import assert from 'node:assert/strict';
import test from 'node:test';
import { checkStructure } from './check.mjs';
import { finding, functionText, noFindings, reportOf, snapshot, unverified } from './check.fixture.mjs';

const PATH = 'src/chart.ts';
const STAGE_RULES = ['stage-lines', 'stage-complexity', 'decider-choice'];
const imports = `import { flowChart as chart, flowChartSelector as selector,
  FlowChartBuilder as Builder, decide as chooseOne, select as chooseMany } from 'footprintjs';`;
const root = "chart('Root', () => {}, 'root')";
const decider = `${root}.addDeciderFunction('Route', scope => chooseOne(scope, []), 'route')`;
const selector = `${root}.addSelectorFunction('Route', scope => chooseMany(scope, []), 'route')`;
const observe = text => reportOf(checkStructure(snapshot({ [PATH]: text })));

test('actual stage positions reject 41 lines through each direct callback door', () => {
  const sites = [
    "chart('Root', stage, 'root')",
    "selector('Root', stage, 'root')",
    "new Builder().start('Root', stage, 'root')",
    "new Builder().startSelector('Root', stage, 'root')",
    `${root}.addFunction('Work', stage, 'work')`,
    `${root}.addStreamingFunction('Work', stage, 'work')`,
    `${root}.addDeciderFunction('Route', stage, 'route')`,
    `${root}.addSelectorFunction('Route', stage, 'route')`,
    `${decider}.addFunctionBranch('branch', 'Work', stage)`,
    `${selector}.addFunctionBranch('branch', 'Work', stage)`,
    `${root}.addListOfFunction([{ id: 'work', name: 'Work', fn: stage }])`,
    `${decider}.addBranchList([{ id: 'work', name: 'Work', fn: stage }])`,
    `${selector}.addBranchList([{ id: 'work', name: 'Work', fn: stage }])`,
  ];
  for (const site of sites) {
    finding(observe(`${imports}\n${functionText({ lines: 41 })}\n${site};`), 'stage-lines', PATH);
  }
});

test('stage equality at 40 lines and complexity 8 is admitted', () => {
  const body = functionText({ lines: 40, branches: 7 });
  noFindings(observe(`${imports}\n${body}\n${root}.addFunction('Work', stage, 'work');`), STAGE_RULES);
});

test('a ninth path is stage complexity even below the line ceiling', () => {
  const body = functionText({ lines: 20, branches: 8 });
  finding(observe(`${imports}\n${body}\n${root}.addFunction('Work', stage, 'work');`), 'stage-complexity', PATH);
});

test('import aliases namespace calls and immutable callback aliases resolve', () => {
  const text = `import * as fp from 'footprintjs';
    ${functionText({ name: 'work', lines: 41 })}
    const callback = work;
    const graph = fp.flowChart('Root', () => {}, 'root');
    graph.addFunction('Work', callback, 'work');`;
  const report = observe(text);
  finding(report, 'stage-lines', PATH);
  assert.deepEqual(report.coverage.unverified.filter(item => item.kind === 'stage-binding'), []);
});

test('pausable execute and resume are each stage callbacks at the actual handler position', () => {
  const sites = [
    "chart('Root', HANDLER, 'root')",
    "new Builder().start('Root', HANDLER, 'root')",
    `${root}.addPausableFunction('Pause', HANDLER, 'pause')`,
    `${decider}.addPausableFunctionBranch('pause', 'Pause', HANDLER)`,
    `${selector}.addPausableFunctionBranch('pause', 'Pause', HANDLER)`,
  ];
  for (const member of ['execute', 'resume']) {
    const handler = member === 'execute' ? '{ execute: stage, resume() {} }' : '{ execute() {}, resume: stage }';
    for (const site of sites) {
      const text = `${imports}\n${functionText({ lines: 41 })}\n${site.replace('HANDLER', handler)};`;
      finding(observe(text), 'stage-lines', PATH);
    }
  }
});

test('a decider needs its own real decision call rather than a nested or shadowed name', () => {
  const missing = `${imports}\n${root}.addDeciderFunction('Route', () => 'left', 'route');`;
  finding(observe(missing), 'decider-choice', PATH);
  const nested = `${imports}\n${root}.addDeciderFunction('Route', scope => {
    function unused() { return chooseOne(scope, []); } return 'left';
  }, 'route');`;
  finding(observe(nested), 'decider-choice', PATH);
  const shadowed = `${imports}\nfunction decide() { return 'left'; }
    ${root}.addDeciderFunction('Route', () => decide(), 'route');`;
  finding(observe(shadowed), 'decider-choice', PATH);
});

test('real imported decision aliases and selector aliases satisfy choice evidence', () => {
  noFindings(observe(`${imports}\n${decider}.end();\n${selector}.end();
    selector('Root', scope => chooseMany(scope, []), 'root-selector');`), ['decider-choice']);
});

test('shadowing the actual imported decision alias cannot satisfy choice evidence', () => {
  const parameter = `${imports}\n${root}.addDeciderFunction('Route', chooseOne => chooseOne(), 'route');`;
  finding(observe(parameter), 'decider-choice', PATH);
  const local = `${imports}\n${root}.addDeciderFunction('Route', scope => {
    const chooseOne = () => 'left'; return chooseOne();
  }, 'route');`;
  finding(observe(local), 'decider-choice', PATH);
});

test('namespace decision and selection calls establish their own stage choice', () => {
  const text = `import * as fp from 'footprintjs';
    fp.flowChart('Root', () => {}, 'root')
      .addDeciderFunction('Route', scope => fp.decide(scope, []), 'route');
    fp.flowChartSelector('Pick', scope => fp.select(scope, []), 'pick');`;
  const report = observe(text);
  noFindings(report, ['decider-choice']);
  assert.deepEqual(report.coverage.unverified.filter(item => item.kind === 'stage-binding'), []);
});

test('unresolved receiver and callback values are incomplete rather than silently admitted', () => {
  const callback = observe(`${imports}\nconst stage = loadStage();\n${root}.addFunction('Work', stage, 'work');`);
  unverified(callback, 'stage-binding', PATH);
  const receiver = observe(`${functionText({ lines: 41 })}\ngetBuilder().addFunction('Work', stage, 'work');`);
  unverified(receiver, 'stage-binding', PATH);
});

test('known unrelated methods are not mistaken for footprint stage registration', () => {
  const text = `${functionText({ lines: 41 })}
    const service = { addFunction(name, callback, id) { return id; } };
    service.addFunction('Work', stage, 'work');`;
  noFindings(observe(text), STAGE_RULES);
});

test('lazy chart factories and dynamic branch adapters are not stage callbacks', () => {
  const text = `${imports}\n${functionText({ lines: 41 })}
    ${root}.addLazySubFlowChart('child', stage)
      .addLazySubFlowChartNext('next', stage)
      .addParallelForEach('Each', 'each', { items: stage, branch: stage, maxBranches: 1, into: 'out' });
    ${decider}.addLazySubFlowChartBranch('branch', stage);`;
  noFindings(observe(text), STAGE_RULES);
});
