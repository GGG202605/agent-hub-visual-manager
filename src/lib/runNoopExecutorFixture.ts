import type {
  ActionQueueMockItem,
  NoopExecutorFinalGitStatusFixture,
  NoopExecutorFixtureReceipt,
  NoopExecutorScenario,
  NoopExecutorScenarioResult,
  NoopExecutorScenarioStatus,
  NoopExecutorVerificationStatus,
  SemiAutoLoopReadiness,
} from '../types';

const requiredForbiddenActions = ['shell', 'npm', 'git', 'write', 'wiki', 'external_action', 'auto_send', 'push', 'real_data'];
const requiredReviews = ['AG-SEC', 'AG-REVIEW', 'PRO'];
const noopOnlyScope = ['validate_contract', 'generate_simulated_receipt'];
const runtimeEscalationPattern =
  /\b(shell|npm\s+run|npm|git\s+(add|commit|push|checkout|reset)|write\s+file|delete\s+file|external\s+api|auto-send|push)\b/i;

export function runNoopExecutorFixture(queueItem: ActionQueueMockItem): NoopExecutorFixtureReceipt {
  return runNoopExecutorScenario({
    scenarioId: 'SCN-052-VALID-NOOP',
    title: 'valid noop fixture receipt',
    kind: 'valid_noop_fixture_receipt',
    expectedStatus: 'pass',
    queueItem,
  }).receipt;
}

export function runNoopExecutorScenarioMatrix(queueItem: ActionQueueMockItem): NoopExecutorScenarioResult[] {
  return createNoopExecutorScenarios(queueItem).map(runNoopExecutorScenario);
}

export function createSemiAutoLoopReadiness(): SemiAutoLoopReadiness {
  return {
    canEnterNoopExecutorControlledLoopMock: true,
    actionQueueLoopUiAllowed: true,
    humanApprovalRequired: true,
    realExecutorAllowed: false,
    writeShellNpmGitPushAllowed: false,
    readinessConclusion:
      'Ready for a no-op executor controlled loop mock only; real executor, shell, npm, Git, write, and push remain blocked.',
    conditionsBlockingRealExecutor: [
      'No user approval for a real executor implementation.',
      'No approval for backend, filesystem, local path read, shell, npm, Git, write, external, commit, or push capability.',
      'No selected-path write receipt or rollback gate has been approved.',
      'Parser and queue output are recommendation signals, not execution approval.',
      'Human approval is still required before any copied instruction or future action.',
    ],
    allowedNextMockSteps: [
      'Display semi-auto action loop UI as mock-only.',
      'Generate synthetic no-op receipts from mock queue items.',
      'Show blocked scenario evidence and readiness state.',
      'Keep all actions manual, copy-only, and approval-gated.',
    ],
    forbiddenRealActions: ['shell', 'npm', 'git', 'write', 'commit', 'push', 'external_action', 'real_executor'],
  };
}

export function runNoopExecutorScenario(scenario: NoopExecutorScenario): NoopExecutorScenarioResult {
  const queueItem = scenario.queueItem;
  const missingFields = requiredContractFields(queueItem);
  const missingForbiddenActions = requiredForbiddenActions.filter(
    (action) => !queueItem.forbiddenActions.includes(action),
  );
  const forbiddenSignals = detectForbiddenRuntimeSignals(queueItem);
  const requiredReviewsPresent = requiredReviews.every((review) => queueItem.requiredReviews.includes(review));
  const allowedScopeIsNoopOnly =
    noopOnlyScope.every((scope) => queueItem.allowedScope.includes(scope)) &&
    queueItem.allowedScope.every((scope) => noopOnlyScope.includes(scope));
  const finalGitStatusFixture = scenario.finalGitStatusFixture ?? 'clean_staged_empty_fixture';
  const finalGitStatusMatchesFixture = finalGitStatusFixture === 'clean_staged_empty_fixture';
  const simulatedOnly = scenario.simulatedOnlyOverride ?? true;
  const simulatedOnlyAssertion = simulatedOnly === true;
  const contractFieldsValid =
    missingFields.length === 0 &&
    missingForbiddenActions.length === 0 &&
    forbiddenSignals.length === 0 &&
    requiredReviewsPresent &&
    queueItem.riskLevel === 'low_noop' &&
    allowedScopeIsNoopOnly;
  const verification = resolveScenarioVerification({
    contractFieldsValid,
    finalGitStatusMatchesFixture,
    forceUnverifiableReceipt: scenario.forceUnverifiableReceipt === true,
    simulatedOnlyAssertion,
  });
  const blockedReason = buildBlockedReason({
    allowedScopeIsNoopOnly,
    contractFieldsValid,
    finalGitStatusFixture,
    finalGitStatusMatchesFixture,
    forbiddenSignals,
    forceUnverifiableReceipt: scenario.forceUnverifiableReceipt === true,
    missingFields,
    missingForbiddenActions,
    queueItem,
    requiredReviewsPresent,
    simulatedOnlyAssertion,
  });

  return {
    scenario,
    receipt: {
      scenario_id: scenario.scenarioId,
      scenario_title: scenario.title,
      scenario_kind: scenario.kind,
      scenario_status: verification.scenarioStatus,
      action_id: queueItem.actionId,
      approval_id: queueItem.approvalId,
      envelope_hash: queueItem.envelopeHash,
      executor_mode: 'noop_fixture',
      dry_run_type: 'simulated_action_queue_contract_check',
      receipt_status: verification.receiptStatus,
      simulated_only: simulatedOnly,
      real_executor_implemented: false,
      shell_access: false,
      npm_action: false,
      git_action: false,
      write_action: false,
      external_action: false,
      no_file_change_assertion: true,
      final_git_status_fixture: finalGitStatusFixture,
      blocked_reason: blockedReason,
      verification_status: verification.verificationStatus,
      receipt_verification_status: verification.verificationStatus,
      final_git_status_matches_fixture: finalGitStatusMatchesFixture,
      simulated_only_assertion: simulatedOnlyAssertion,
      synthetic_blocked_scenario: verification.scenarioStatus !== 'pass',
      contract_fields_valid: contractFieldsValid,
      forbidden_actions_detected: forbiddenSignals,
      required_reviews_present: requiredReviewsPresent,
      consumed_queue_item_id: queueItem.queueId,
      executed_command_count: 0,
      files_changed_count: 0,
      verification_notes: [
        'No command invocation path exists in this fixture.',
        'No filesystem, shell, npm, Git, Wiki, external, write, commit, or push capability is called.',
        'Receipt is simulated data generated from a mock action queue item.',
        'No-op fixture output is not approval for a real executor.',
        'Blocked scenario is synthetic; no real action executed.',
      ],
    },
  };
}

function createNoopExecutorScenarios(queueItem: ActionQueueMockItem): NoopExecutorScenario[] {
  const validQueueItem: ActionQueueMockItem = {
    ...queueItem,
    queueId: 'AQ-052-VALID-NOOP',
    actionId: 'AQ-052-VALID-NOOP-RECEIPT',
    approvalId: 'APPROVAL-DemoScenario036-NOOP-SYNTHETIC',
    envelopeHash: 'env_DemoScenario036_valid_noop',
    riskLevel: 'low_noop',
    allowedScope: [...noopOnlyScope],
    forbiddenActions: [...requiredForbiddenActions],
    requiredReviews: [...requiredReviews],
    proposedAction: 'Validate no-op executor fixture scenario matrix',
    requiredApproval: 'DemoScenario037 mock-only loop approval for synthetic fixture only',
    requiredReview: 'AG-SEC, AG-REVIEW, and Pro commit-only closeout',
    requiredReceipt: 'simulated receipt with no-file-change assertion',
    blockedReason: 'none; valid no-op fixture scenario',
    nextDecision: 'DemoScenario037 semi-auto action loop mock / synthetic scenario matrix',
  };

  return [
    {
      scenarioId: 'SCN-052-01',
      title: 'valid noop fixture receipt',
      kind: 'valid_noop_fixture_receipt',
      expectedStatus: 'pass',
      queueItem: validQueueItem,
    },
    {
      scenarioId: 'SCN-052-02',
      title: 'missing approval blocked',
      kind: 'missing_approval',
      expectedStatus: 'blocked',
      queueItem: withQueueOverrides(validQueueItem, {
        queueId: 'AQ-052-MISSING-APPROVAL',
        actionId: 'AQ-052-MISSING-APPROVAL',
        approvalId: '',
        blockedReason: 'missing approval must block simulated receipt',
      }),
    },
    {
      scenarioId: 'SCN-052-03',
      title: 'missing envelope_hash blocked',
      kind: 'missing_envelope_hash',
      expectedStatus: 'blocked',
      queueItem: withQueueOverrides(validQueueItem, {
        queueId: 'AQ-052-MISSING-HASH',
        actionId: 'AQ-052-MISSING-HASH',
        envelopeHash: '',
        blockedReason: 'missing envelope_hash must block simulated receipt',
      }),
    },
    {
      scenarioId: 'SCN-052-04',
      title: 'malformed queue item blocked',
      kind: 'malformed_queue_item',
      expectedStatus: 'blocked',
      queueItem: withQueueOverrides(validQueueItem, {
        queueId: 'AQ-052-MALFORMED',
        actionId: '',
        approvalId: '',
        envelopeHash: '',
        allowedScope: [],
        forbiddenActions: [],
        requiredReviews: [],
        proposedAction: '',
        blockedReason: 'malformed queue item must not produce an executable receipt',
      }),
    },
    {
      scenarioId: 'SCN-052-05',
      title: 'risk mismatch blocked',
      kind: 'risk_mismatch',
      expectedStatus: 'blocked',
      queueItem: withQueueOverrides(validQueueItem, {
        queueId: 'AQ-052-RISK-MISMATCH',
        actionId: 'AQ-052-RISK-MISMATCH',
        riskLevel: 'medium_review_required',
        blockedReason: 'risk level is not low_noop',
      }),
    },
    {
      scenarioId: 'SCN-052-06',
      title: 'forbidden action requested blocked',
      kind: 'forbidden_action_requested',
      expectedStatus: 'blocked',
      queueItem: withQueueOverrides(validQueueItem, {
        queueId: 'AQ-052-FORBIDDEN-ACTION',
        actionId: 'AQ-052-FORBIDDEN-ACTION',
        allowedScope: ['validate_contract', 'generate_simulated_receipt', 'write_file'],
        proposedAction: 'Request write file from no-op fixture',
        blockedReason: 'forbidden action requested in no-op fixture',
      }),
    },
    {
      scenarioId: 'SCN-052-07',
      title: 'attempted shell/npm/git/write blocked',
      kind: 'attempted_shell_npm_git_write',
      expectedStatus: 'blocked',
      queueItem: withQueueOverrides(validQueueItem, {
        queueId: 'AQ-052-SHELL-NPM-GIT-WRITE',
        actionId: 'AQ-052-SHELL-NPM-GIT-WRITE',
        proposedAction: 'Attempt shell npm run build git commit write file and push',
        nextDecision: 'Attempt shell/npm/Git/write from UI',
        blockedReason: 'shell/npm/Git/write text must block the fixture',
      }),
    },
    {
      scenarioId: 'SCN-052-08',
      title: 'unverifiable receipt blocked',
      kind: 'unverifiable_receipt',
      expectedStatus: 'unverifiable',
      forceUnverifiableReceipt: true,
      queueItem: withQueueOverrides(validQueueItem, {
        queueId: 'AQ-052-UNVERIFIABLE',
        actionId: 'AQ-052-UNVERIFIABLE',
        blockedReason: 'receipt verifier cannot prove simulated-only evidence',
      }),
    },
    {
      scenarioId: 'SCN-052-09',
      title: 'final_git_status_fixture mismatch blocked',
      kind: 'final_git_status_fixture_mismatch',
      expectedStatus: 'failed',
      finalGitStatusFixture: 'dirty_fixture_mismatch',
      queueItem: withQueueOverrides(validQueueItem, {
        queueId: 'AQ-052-GIT-STATUS-MISMATCH',
        actionId: 'AQ-052-GIT-STATUS-MISMATCH',
        blockedReason: 'final git status fixture mismatch',
      }),
    },
    {
      scenarioId: 'SCN-052-10',
      title: 'simulated_only=false blocked',
      kind: 'simulated_only_false',
      expectedStatus: 'failed',
      simulatedOnlyOverride: false,
      queueItem: withQueueOverrides(validQueueItem, {
        queueId: 'AQ-052-SIMULATED-FALSE',
        actionId: 'AQ-052-SIMULATED-FALSE',
        blockedReason: 'simulated_only=false must fail receipt verification',
      }),
    },
  ];
}

function withQueueOverrides(base: ActionQueueMockItem, overrides: Partial<ActionQueueMockItem>): ActionQueueMockItem {
  return {
    ...base,
    allowedScope: [...base.allowedScope],
    forbiddenActions: [...base.forbiddenActions],
    requiredReviews: [...base.requiredReviews],
    ...overrides,
  };
}

function resolveScenarioVerification({
  contractFieldsValid,
  finalGitStatusMatchesFixture,
  forceUnverifiableReceipt,
  simulatedOnlyAssertion,
}: {
  contractFieldsValid: boolean;
  finalGitStatusMatchesFixture: boolean;
  forceUnverifiableReceipt: boolean;
  simulatedOnlyAssertion: boolean;
}): {
  receiptStatus: 'simulated_noop' | 'blocked' | 'failed';
  scenarioStatus: NoopExecutorScenarioStatus;
  verificationStatus: NoopExecutorVerificationStatus;
} {
  if (forceUnverifiableReceipt) {
    return {
      receiptStatus: 'blocked',
      scenarioStatus: 'unverifiable',
      verificationStatus: 'blocked_unverifiable',
    };
  }

  if (!finalGitStatusMatchesFixture || !simulatedOnlyAssertion) {
    return {
      receiptStatus: 'failed',
      scenarioStatus: 'failed',
      verificationStatus: 'failed_verification',
    };
  }

  if (!contractFieldsValid) {
    return {
      receiptStatus: 'blocked',
      scenarioStatus: 'blocked',
      verificationStatus: 'blocked_unverifiable',
    };
  }

  return {
    receiptStatus: 'simulated_noop',
    scenarioStatus: 'pass',
    verificationStatus: 'verified_simulated_only',
  };
}

function buildBlockedReason({
  allowedScopeIsNoopOnly,
  contractFieldsValid,
  finalGitStatusFixture,
  finalGitStatusMatchesFixture,
  forbiddenSignals,
  forceUnverifiableReceipt,
  missingFields,
  missingForbiddenActions,
  queueItem,
  requiredReviewsPresent,
  simulatedOnlyAssertion,
}: {
  allowedScopeIsNoopOnly: boolean;
  contractFieldsValid: boolean;
  finalGitStatusFixture: NoopExecutorFinalGitStatusFixture;
  finalGitStatusMatchesFixture: boolean;
  forbiddenSignals: string[];
  forceUnverifiableReceipt: boolean;
  missingFields: string[];
  missingForbiddenActions: string[];
  queueItem: ActionQueueMockItem;
  requiredReviewsPresent: boolean;
  simulatedOnlyAssertion: boolean;
}) {
  if (
    contractFieldsValid &&
    finalGitStatusMatchesFixture &&
    !forceUnverifiableReceipt &&
    simulatedOnlyAssertion
  ) {
    return '';
  }

  return [
    missingFields.length > 0 ? `missing fields: ${missingFields.join(', ')}` : '',
    missingForbiddenActions.length > 0 ? `missing forbidden actions: ${missingForbiddenActions.join(', ')}` : '',
    forbiddenSignals.length > 0 ? `forbidden runtime signals: ${forbiddenSignals.join(', ')}` : '',
    requiredReviewsPresent ? '' : 'required reviews missing',
    queueItem.riskLevel === 'low_noop' ? '' : `risk level mismatch: ${queueItem.riskLevel}`,
    allowedScopeIsNoopOnly ? '' : 'allowed scope is not no-op only',
    forceUnverifiableReceipt ? 'receipt verification status is blocked_unverifiable' : '',
    finalGitStatusMatchesFixture ? '' : `final_git_status_fixture mismatch: ${finalGitStatusFixture}`,
    simulatedOnlyAssertion ? '' : 'simulated_only assertion failed: false',
    queueItem.blockedReason && queueItem.blockedReason !== 'none; valid no-op fixture scenario'
      ? queueItem.blockedReason
      : '',
  ]
    .filter(Boolean)
    .join(' | ');
}

function requiredContractFields(queueItem: ActionQueueMockItem) {
  return [
    ['action_id', queueItem.actionId],
    ['approval_id', queueItem.approvalId],
    ['envelope_hash', queueItem.envelopeHash],
    ['risk_level', queueItem.riskLevel],
    ['allowed_scope', queueItem.allowedScope.length > 0 ? 'present' : ''],
    ['forbidden_actions', queueItem.forbiddenActions.length > 0 ? 'present' : ''],
    ['required_reviews', queueItem.requiredReviews.length > 0 ? 'present' : ''],
  ]
    .filter(([, value]) => !value)
    .map(([field]) => field);
}

function detectForbiddenRuntimeSignals(queueItem: ActionQueueMockItem) {
  const checkedText = [queueItem.proposedAction, queueItem.nextDecision].join(' ');
  return runtimeEscalationPattern.test(checkedText) ? ['runtime_escalation_text'] : [];
}
