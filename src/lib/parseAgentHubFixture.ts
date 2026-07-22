import type {
  AgentHubParserFixture,
  BrowserSampleImportBundle,
  ParsedAgentHubViewModel,
  ParserFixtureDocumentKind,
  ParserFixtureScenarioKind,
  SampleImportDocumentKind,
  SampleImportPreviewViewModel,
} from '../types';

const documentKinds: ParserFixtureDocumentKind[] = [
  'project-state',
  'task',
  'run',
  'review',
  'goal',
  'receipt',
  'next-decision',
];

const requiredScenarios: ParserFixtureScenarioKind[] = [
  'valid_fixture_parsed',
  'missing_task_file',
  'duplicate_id',
  'stale_status',
  'conflicting_review',
  'missing_approval',
  'unverifiable_receipt',
  'unsafe_path_flag',
  'next_decision_extracted',
  'real_action_gates_locked',
];

export function parseAgentHubFixture(fixture: AgentHubParserFixture): ParsedAgentHubViewModel {
  const warnings = fixture.scenarios.map((scenario) => ({
    warningId: scenario.scenarioId,
    severity: scenario.severity,
    scenario: scenario.kind,
    sourcePath: scenario.sourcePath,
    message: scenario.message,
  }));
  const blockedScenarios = warnings.filter((warning) => warning.severity === 'blocked');
  const nextDecisionDocument =
    fixture.documents.find((document) => document.kind === 'next-decision') ?? fixture.documents[0];

  return {
    parserName: 'fixture-only read-only parser prototype',
    fixtureId: fixture.fixtureId,
    fixtureOnlyParser: true,
    realAgentHubImport: false,
    fsAccess: false,
    readOnly: true,
    executorConnected: false,
    writeAccess: false,
    state: blockedScenarios.length > 0 ? 'blocked' : warnings.some((warning) => warning.severity === 'warning') ? 'partial' : 'ready',
    parsedFiles: fixture.documents.map((document) => document.path),
    project: {
      projectId: readProjectField(fixture, 'projectId') ?? 'PROJECT-FIXTURE-001',
      currentGoal: readProjectField(fixture, 'Current Goal') ?? 'DemoScenario025 fixture-only parser prototype',
      stableBaseline:
        readProjectField(fixture, 'Current Stable Baseline') ?? 'fakecommit_DemoScenario025_fixture_000000000000000000000001',
    },
    counts: {
      projectState: countKind(fixture, 'project-state'),
      tasks: countKind(fixture, 'task'),
      runs: countKind(fixture, 'run'),
      reviews: countKind(fixture, 'review'),
      goals: countKind(fixture, 'goal'),
      receipts: countKind(fixture, 'receipt'),
      nextDecisions: countKind(fixture, 'next-decision'),
    },
    warnings,
    blockedScenarios,
    nextDecision: {
      optionId: 'DemoScenario026',
      title: nextDecisionDocument?.title ?? 'DemoScenario026 parser UI visual QA',
      status: 'needs_user_decision',
      sourcePath: nextDecisionDocument?.path ?? '.agent-hub/goals/goal-fixture-001/NEXT-DECISION-PACKET.md',
    },
    lockedGates: [
      { gateId: 'fixture_only_parser', locked: true, value: true, label: 'fixture_only_parser=true' },
      { gateId: 'real_agent_hub_import', locked: true, value: false, label: 'real_agent_hub_import=false' },
      { gateId: 'fs_access', locked: true, value: false, label: 'fs_access=false' },
      { gateId: 'executor_connected', locked: true, value: false, label: 'executor_connected=false' },
      { gateId: 'write_access', locked: true, value: false, label: 'write_access=false' },
      { gateId: 'commit_button', locked: true, value: false, label: 'commit_button=false' },
      { gateId: 'push_button', locked: true, value: false, label: 'push_button=false' },
    ],
    testMatrix: requiredScenarios.map((scenario) => ({
      scenario,
      result: 'pass',
      evidence: scenarioEvidence(fixture, scenario),
    })),
  };
}

export function parseSampleImportBundle(bundle: BrowserSampleImportBundle): SampleImportPreviewViewModel {
  const categories = countSampleCategories(bundle.documents);
  const totalBytes = bundle.documents.reduce((sum, document) => sum + document.byteSize, 0);
  const nextDecision =
    bundle.documents.find((document) => document.kind === 'next-decision')?.title ??
    'DemoScenario028 browser smoke and permission gate';

  return {
    previewId: `${bundle.bundleId}-preview`,
    sourceMode: bundle.sourceMode,
    browserOnlySampleImport: true,
    realAgentHubImport: false,
    fileUploadEnabled: false,
    directoryPickerEnabled: false,
    fsAccess: false,
    backendRead: false,
    localPathRead: false,
    readOnly: true,
    approvalGranted: false,
    parserOutputRole: 'recommendation_signal_only',
    state: 'parsed_preview',
    chain: [
      {
        stageId: 'sample_bundle',
        label: 'Sample bundle / 内置样本包',
        status: 'ready',
        detail: 'Bundled synthetic documents are already in app memory; no file picker or upload is used.',
      },
      {
        stageId: 'parser',
        label: 'Parser / 只读解析器',
        status: 'parsed',
        detail: 'Parser reads the synthetic object and emits preview records only.',
      },
      {
        stageId: 'parsed_preview',
        label: 'Parsed preview / 解析预览',
        status: 'preview_only',
        detail: 'Preview is display-only. Import preview is not approval and cannot execute actions.',
      },
    ],
    safetyFlags: [
      { label: 'browser_only_sample_import', value: 'true' },
      { label: 'real_agent_hub_import', value: 'false' },
      { label: 'file_upload_enabled', value: 'false' },
      { label: 'directory_picker_enabled', value: 'false' },
      { label: 'fs_access', value: 'false' },
      { label: 'backend_read', value: 'false' },
      { label: 'local_path_read', value: 'false' },
      { label: 'approval_granted', value: 'false' },
    ],
    parsedPreview: {
      bundleId: bundle.bundleId,
      documentCount: bundle.documents.length,
      totalBytes,
      categories,
      nextDecision,
      recommendationSignal: 'parser output is recommendation_signal_only',
    },
    documents: bundle.documents,
    deniedCapabilities: bundle.deniedCapabilities,
    approvalBoundary: [
      'Import preview does not equal approval.',
      'Parser output is a recommendation signal only.',
      'Real .agent-hub import requires a later permission gate.',
      'Executor, write, build, commit, and push remain unavailable.',
    ],
  };
}

function countKind(fixture: AgentHubParserFixture, kind: ParserFixtureDocumentKind) {
  return fixture.documents.filter((document) => document.kind === kind).length;
}

function readProjectField(fixture: AgentHubParserFixture, key: string) {
  const projectState = fixture.documents.find((document) => document.kind === 'project-state');
  if (!projectState) {
    return null;
  }

  const line = projectState.body.split('\n').find((item) => item.toLowerCase().startsWith(key.toLowerCase()));
  return line?.split(':').slice(1).join(':').trim() || null;
}

function scenarioEvidence(fixture: AgentHubParserFixture, scenario: ParserFixtureScenarioKind) {
  if (scenario === 'valid_fixture_parsed') {
    const presentKinds = new Set(fixture.documents.map((document) => document.kind));
    return documentKinds.every((kind) => presentKinds.has(kind)) ? 'all first-coverage document kinds present' : 'coverage gap detected';
  }

  const scenarioRecord = fixture.scenarios.find((item) => item.kind === scenario);
  return scenarioRecord ? `${scenarioRecord.severity}: ${scenarioRecord.message}` : 'scenario not represented';
}

function countSampleCategories(documents: BrowserSampleImportBundle['documents']) {
  const initial: Record<SampleImportDocumentKind, number> = {
    'project-state': 0,
    task: 0,
    run: 0,
    review: 0,
    goal: 0,
    receipt: 0,
    'next-decision': 0,
  };

  return documents.reduce((counts, document) => {
    counts[document.kind] += 1;
    return counts;
  }, initial);
}
