export type PhaseStatus = 'closed' | 'committed' | 'in_review' | 'planned' | 'needs_user_decision';
export type Severity = 'High' | 'Medium' | 'Low';
export type ReviewKind = 'AG-SEC' | 'AG-REVIEW' | 'PRO';
export type GateState = 'open' | 'blocked' | 'needs_user_decision';
export type AgentStatus = 'Working' | 'Blocked' | 'Review Ready' | 'Needs User Decision' | 'Done' | 'Idle';
export type AgentId = 'AG-ARCH' | 'AG-SEC' | 'AG-REVIEW' | 'AG-CODE' | 'AG-DOCS' | 'AG-GIT';
export type ImportState = 'ready' | 'partial' | 'blocked' | 'conflict' | 'unsupported_schema' | 'error';
export type ImportSource = 'fixture' | 'browser-selected-agent-hub';

export interface CoordinationLane {
  id: string;
  label: string;
  priority: string;
  state: GateState;
  note: string;
}

export interface DashboardState {
  projectName: string;
  projectNameZh: string;
  currentPhase: string;
  activeTrial: string;
  dataMode: string;
  readScope: string;
  actionPolicy: string;
  nextDecision: string;
  repoStatus: string;
  stagedStatus: string;
  pushStatus: string;
  latestCommit: string;
  compressionStatus: string;
  importModelStatus: string;
  uiBacklogStatus: string;
  coordinationLanes: CoordinationLane[];
  blockedCount: number;
  needsUserDecisionCount: number;
}

export interface PhaseItem {
  id: string;
  title: string;
  status: PhaseStatus;
  commitHash: string;
  closed: boolean;
  committed: boolean;
  needsUserDecision: boolean;
}

export interface TaskItem {
  id: string;
  title: string;
  owner: string;
  status: string;
  severity: Severity;
}

export interface RunItem {
  id: string;
  taskId: string;
  summary: string;
  status: string;
  evidence: string;
}

export interface ReviewItem {
  id: string;
  kind: ReviewKind;
  target: string;
  severity: Severity;
  status: string;
}

export interface BoundaryState {
  allowedActions: string[];
  deniedActions: string[];
  needsUserDecisionActions: string[];
  gates: Array<{
    name: string;
    state: GateState;
    note: string;
  }>;
}

export interface RiskItem {
  riskId: string;
  severity: Severity;
  description: string;
  mitigation: string;
  blocking: boolean;
}

export interface ProvenanceItem {
  id: string;
  sourceArtifact: string;
  generatedArtifact: string;
  reviewId: string;
  commitId: string;
  currentStatus: string;
}

export type AgentFirstStatus = 'completed' | 'standby' | 'awaiting_approval' | 'blocked';
export type AgentFirstLayer = 'decision' | 'execution' | 'audit';
export type AgentFirstRisk = 'low' | 'medium' | 'high';
export type AgentProgressStatus = 'complete' | 'paused' | 'next';

export interface AgentRoleCardView {
  id: string;
  code: string;
  nameZh: string;
  roleTitle: string;
  layer: AgentFirstLayer;
  status: AgentFirstStatus;
  statusLabel: string;
  taskSummary: string;
  recentEvidence: string;
  riskLevel: AgentFirstRisk;
  riskLabel: string;
  nextAction: string;
  connections: readonly string[];
}

export interface AgentHierarchyLayerView {
  layer: AgentFirstLayer;
  title: string;
  subtitle: string;
  agents: readonly string[];
}

export interface AgentProgressItem {
  label: string;
  status: AgentProgressStatus;
  summary: string;
}

export interface AgentNextActionRoute {
  id: string;
  title: string;
  owner: string;
  risk: AgentFirstRisk;
  approval: string;
  recommended: boolean;
  summary: string;
}

export interface AgentFirstDashboardView {
  productName: string;
  tagline: string;
  projectName: string;
  mode: string;
  nextStep: string;
  capabilityLevel: string;
  topMetrics: ReadonlyArray<{
    label: string;
    value: string;
  }>;
  navItems: readonly string[];
  agents: readonly AgentRoleCardView[];
  hierarchy: readonly AgentHierarchyLayerView[];
  relations: ReadonlyArray<{
    from: string;
    to: string;
    label: string;
    state: 'primary' | 'review' | 'paused';
  }>;
  progress: readonly AgentProgressItem[];
  nextActions: readonly AgentNextActionRoute[];
  recentReceipts: ReadonlyArray<{
    title: string;
    time: string;
    summary: string;
  }>;
  safetyBar: readonly string[];
  evidenceSummary: readonly string[];
}

export interface AgentHubMockData {
  dashboard: DashboardState;
  agentFirstDashboard: AgentFirstDashboardView;
  actionGatePilot: ActionGatePilot;
  commitGateEvidence: CommitGateEvidenceView;
  realExecutorPregate: RealExecutorPregateView;
  buildExecutor: BuildExecutorView;
  buildExecutorReceipt: BuildExecutorReceiptView;
  multiFileWrite: MultiFileWriteExecutorView;
  multiFileWriteReceipt: MultiFileWriteReceiptView;
  stageExecutorPreflight: StageExecutorPreflightView;
  stageExecutor: StageExecutorView;
  stageExecutorReceipt: StageExecutorReceiptView;
  stageRecoveryReceipt: StageRecoveryReceiptView;
  commitExecutorPreflight: CommitExecutorPreflightView;
  commitExecutorReceipt: CommitExecutorReceiptView;
  commitRecoveryPolicy: CommitRecoveryPolicyView;
  pushRemoteTarget: PushRemoteTargetView;
  pushExecutorPreflight: PushExecutorPreflightView;
  pushNoExecutionCloseout: PushNoExecutionCloseoutView;
  pushExecutorContract: PushExecutorContractView;
  pushExecutorReceipt: PushExecutorReceiptView;
  pushRemoteVerification: PushRemoteVerificationView;
  finalExecutionChainCloseout: FinalExecutionChainCloseoutView;
  localExecutionChainFinal: LocalExecutionChainFinalView;
  productizationReadiness: ProductizationReadinessView;
  finalHandoff: FinalHandoffView;
  noPushFinalization: NoPushFinalizationView;
  productOverviewDashboard: ProductOverviewDashboardView;
  executionChainRoadmap: ExecutionChainRoadmapView;
  evidenceSummary: EvidenceSummaryView;
  safetyBoundarySummary: SafetyBoundarySummaryView;
  productNextDecision: ProductNextDecisionView;
  localV01ProductReview: LocalV01ProductReviewView;
  newChatHandoff: NewChatHandoffView;
  productDemoFlow: ProductDemoFlowView;
  capabilityMaturitySummary: CapabilityMaturitySummaryView;
  finalReviewScorecard: FinalReviewScorecardView;
  userJourney: UserJourneyView;
  executionChainReadiness: ExecutionChainReadinessView;
  rollbackRecoveryPolicy: RollbackRecoveryPolicyView;
  rollbackRecoveryPrototype: RollbackRecoveryPrototypeView;
  rollbackRecoveryPreflight: RollbackPreflightView;
  rollbackRecoveryCloseout: RollbackRecoveryCloseoutView;
  selectedPathWriteExecutorPrototype: SelectedPathWriteExecutorPrototypeView;
  selectedPathWritePreflight: SelectedPathWritePreflightView;
  writeExecutorBoundary: WriteExecutorBoundaryView;
  readonlyMetadataExecutorPrototype: ReadonlyMetadataExecutorPrototypeView;
  readonlyMetadataExecutorExecutionReceipt: ReadonlyMetadataExecutorExecutionReceipt;
  handoffEvidence: HandoffEvidenceView;
  actionQueueMock: ActionQueueMockView;
  executorSandboxBoundary: ExecutorSandboxBoundaryView;
  phases: PhaseItem[];
  tasks: TaskItem[];
  runs: RunItem[];
  reviews: ReviewItem[];
  boundaries: BoundaryState;
  risks: RiskItem[];
  provenance: ProvenanceItem[];
}

export interface FixtureProjectRecord {
  projectId?: string;
  projectName?: string;
  currentGoal?: string;
  currentPhase?: string;
  stableBaseline?: string;
  buildStatus?: string;
  repoStatus?: string;
  commitGate?: string;
}

export interface FixtureAgentRecord {
  agentId: AgentId;
  agentName: string;
  roleTitle: string;
  visualRole: string;
  status: AgentStatus;
  currentTask: string;
  riskLevel: Severity | 'None';
  reviewCount: number;
  lastActivity: string;
  needsUserDecision: boolean;
  blockedReason?: string;
  decisionReason?: string;
  activityIndicator: string;
  sourceRefs: string[];
}

export interface FixtureGateRecord {
  gateId: string;
  label: string;
  state: GateState;
  requiredApproval: string;
  blockingReason: string;
}

export interface FixtureTaskRecord {
  taskId: string;
  title: string;
  owner: AgentId;
  status: AgentStatus;
  sourceRef: string;
}

export interface FixtureRunRecord {
  runId: string;
  summary: string;
  status: AgentStatus;
  activity: string;
  sourceRef: string;
}

export interface FixtureReviewRecord {
  reviewId: string;
  kind: ReviewKind;
  status: AgentStatus;
  high: number;
  medium: number;
  low: number;
  sourceRef: string;
}

export interface FixtureDecisionRecord {
  optionId: 'DRAFT1' | 'LOOP1' | 'LOOP2' | 'LOOP3' | 'IMPORT1' | 'UX4' | 'PUSH-GATE' | 'Pause' | string;
  title: string;
  status: 'needs_user_decision';
  reason: string;
  sourceRef: string;
  approvalRequired?: boolean;
  proRequired?: boolean;
  commitAllowed?: boolean;
  conditionalCommitAllowed?: boolean;
}

export type ActionLevel = 'L0' | 'L1' | 'L2' | 'L3' | 'L4';
export type ActionEnvelopeStatus = 'draft_only' | 'approval_pending' | 'execution_locked';

export interface ActionEnvelopeDraft {
  action_id: string;
  action_type: string;
  source_goal: string;
  source_option: string;
  target_repo: string;
  target_paths: string[];
  allowed_scope: string[];
  denied_scope: string[];
  preconditions: string[];
  human_approval_required: true;
  pro_review_required: boolean;
  dry_run_required: boolean;
  expected_outputs: string[];
  rollback_or_recovery_note: string;
  evidence_required: string[];
  expiry_note: string;
  one_time_token_required: true;
  envelope_hash_preview: string;
  envelope_status: ActionEnvelopeStatus;
  current_action_level: 'L1 draft-only';
  commit_allowed_draft: boolean;
  conditional_commit_allowed_draft: boolean;
}

export interface OperationReceiptTemplate {
  action_id: string;
  approved_by: string;
  approval_time: string;
  executor_identity: string;
  start_time: string;
  end_time: string;
  command_summary: string;
  files_changed: string[];
  diff_summary: string;
  build_test_result: string;
  errors_warnings: string;
  rollback_status: string;
  final_git_status: string;
  commit_hash: string;
  push_status: string;
  evidence_refs: string[];
  receipt_status: 'not_executed_template';
}

export interface ActionControlSafetyState {
  currentActionLevel: 'L1 draft-only';
  executorConnected: false;
  dryRunApproved: false;
  writeApproved: false;
  externalActionApproved: false;
  pushApproved: false;
}

export interface ReceiptReviewItem {
  label: string;
  value: string;
  status: 'pending' | 'not_executed' | 'unavailable' | 'template';
  note: string;
}

export interface ReceiptReviewView {
  receipt_status: 'not_executed_template';
  action_id: string;
  approval_status: ReceiptReviewItem;
  executor_status: ReceiptReviewItem;
  command_summary_status: ReceiptReviewItem;
  files_changed_status: ReceiptReviewItem;
  diff_summary_status: ReceiptReviewItem;
  build_test_status: ReceiptReviewItem;
  final_git_status: ReceiptReviewItem;
  commit_hash_status: ReceiptReviewItem;
  push_status: ReceiptReviewItem;
  evidence_refs_status: ReceiptReviewItem;
  missing_evidence_checklist: string[];
  blocked_reason: string;
  receipt_timeline: Array<{
    step: string;
    status: 'template_ready' | 'blocked' | 'not_started';
    note: string;
  }>;
}

export interface DryRunMockPlan {
  simulator_mode: 'fixture_only_mock';
  real_dry_run_approved: false;
  executor_connected: false;
  filesystem_access: false;
  shell_access: false;
  write_access: false;
  action_id: string;
  source_envelope: string;
  planned_checks: string[];
  blocked_real_actions: string[];
  expected_evidence_if_future_dry_run_is_approved: string[];
  stop_conditions: string[];
  next_approval_required: string[];
  realDryRunImplemented: false;
}

export type ActionGateStatus = 'pass' | 'blocked' | 'needs_user_decision';

export interface ActionGateStatusItem {
  gateId: string;
  label: string;
  status: ActionGateStatus;
  summary: string;
  evidence: string;
}

export interface MetadataPreflightRepoState {
  repoLabel: string;
  branch: string;
  head: string;
  status: 'clean';
  staged: 'empty';
}

export interface MetadataPreflightReceipt {
  operation_id: string;
  timestamp: string;
  approval_scope: 'metadata_only_preflight';
  receipt_status: 'executed_metadata_only';
  control_project: MetadataPreflightRepoState;
  second_project: MetadataPreflightRepoState;
  unchanged_assertion: string;
  command_scope: string[];
}

export interface ActionGatePilot {
  real_dry_run_approved: false;
  build_execution_approved: false;
  selected_path_write_approved: false;
  executor_implemented: false;
  metadataPreflightReceipt: MetadataPreflightReceipt;
  gateStatus: ActionGateStatusItem[];
  stopPassBlock: ActionGateStatusItem[];
  receiptEvidence: Array<{
    label: string;
    kind: 'fixture_receipt' | 'metadata_preflight_receipt' | 'build_validation_receipt';
    status: string;
    evidence: string;
  }>;
  nextDecisionPacket: string[];
}

export interface CommitGateExactPath {
  repo: 'control_project' | 'second_project';
  path: string;
  status: 'allowed_exact_path';
  reason: string;
}

export interface CommitGateEvidenceView {
  mode: 'commit_gate_evidence_mock';
  summary: string;
  exactPaths: CommitGateExactPath[];
  reviewStatus: {
    agSec: string;
    agReview: string;
    proCloseout: string;
    highMediumGate: string;
  };
  stagedCheck: {
    stagedMustMatchExactPaths: true;
    cachedNameOnlyRequired: true;
    cachedDiffCheckRequired: true;
    broadStagingForbidden: true;
  };
  permissions: {
    commitFromUi: false;
    gitAddDotAllowed: false;
    realGitActionFromUi: false;
    pushPermission: false;
  };
  evidenceFlags: string[];
}

export interface RealExecutorPregateView {
  mode: 'real_executor_pregate_planning_only';
  summary: string;
  realExecutorApproved: false;
  realExecutorImplemented: false;
  noOpExecutorOnly: true;
  independentProGateRequired: true;
  sandboxProfileRequired: true;
  receiptRollbackRecoveryRequired: true;
  prerequisites: string[];
  absolutelyForbiddenActions: string[];
  receiptRollbackRecoveryEvidence: string[];
  recommendation: string;
  safetyFlags: Array<{
    label: string;
    value: string;
  }>;
}

export type BuildExecutorReceiptStatus = 'executed_build_executor_passed' | 'blocked' | 'failed';

export interface BuildExecutorView {
  build_executor_v0_1: true;
  build_executor_implemented: true;
  build_executor_executed: true;
  allowed_command: 'npm run build';
  allowed_cwd: string;
  shell: false;
  npm_install_update_allowed: false;
  dev_preview_test_allowed: false;
  package_config_css_dependency_change_allowed: false;
  stage_permission: false;
  commit_permission: false;
  push_permission: false;
  summary: string;
  allowedCommands: readonly string[];
  forbiddenCommands: readonly string[];
  receiptRequirements: readonly string[];
  artifactPolicy: readonly string[];
  stopConditions: readonly string[];
}

export interface BuildExecutorReceiptView {
  receipt_id: string;
  approval_id: string;
  executor_mode: 'build_executor_v0_1';
  command: 'npm run build';
  cwd: string;
  exit_code: 0;
  warnings_summary: string;
  pre_status_summary: string;
  post_status_summary: string;
  package_package_lock_diff_check: 'unchanged';
  package_config_css_dependency_diff_check: 'unchanged';
  artifact_policy: string;
  receipt_status: BuildExecutorReceiptStatus;
  verification_status: 'pass';
  stop_checks: readonly RollbackStopCheck[];
}

export interface MultiFileWriteApprovalPacket {
  approval_id: string;
  executor_mode: 'selected_path_write_two_files';
  allowed_repo: string;
  allowed_cwd: string;
  allowed_target_paths: readonly string[];
  max_files: 2;
  max_bytes_total: 2048;
  max_bytes_per_file: 1024;
  expected_diff_summary: string;
  preimage_required: true;
  postimage_required: true;
  rollback_strategy: string;
  human_review_required: true;
  pro_gate_required: true;
  stop_conditions: readonly string[];
}

export interface MultiFileWriteReceiptView {
  receipt_id: string;
  approval_id: string;
  executor_mode: 'selected_path_write_two_files';
  target_paths: readonly string[];
  changed_files: readonly string[];
  file_sizes: ReadonlyArray<{
    path: string;
    bytes: number;
  }>;
  postimage_hashes: ReadonlyArray<{
    path: string;
    sha256: string;
  }>;
  total_bytes: number;
  diff_summary: string;
  staged_status: 'empty_before_manual_commit';
  head_changed_by_executor: false;
  package_config_css_dependency_change: false;
  receipt_status: 'executed_selected_path_write_two_files';
  verification_status: 'pass';
  zero_extra_mutation_assertion: true;
}

export interface MultiFileWriteExecutorView {
  multi_file_selected_path_write: true;
  write_executor_enabled: true;
  write_execution_approved: true;
  actual_write_performed: true;
  max_files: 2;
  max_bytes_total: 2048;
  stage_permission: false;
  commit_permission: false;
  push_permission: false;
  summary: string;
  approvalPacket: MultiFileWriteApprovalPacket;
  receipt: MultiFileWriteReceiptView;
  preflightChecks: readonly RollbackStopCheck[];
}

export interface StageExecutorPreflightView {
  stage_executor_candidate: true;
  stage_executor_enabled: false;
  stage_execution_approved: false;
  stage_preflight_only: true;
  actual_stage_performed: false;
  commit_permission: false;
  push_permission: false;
  summary: string;
  policyPoints: readonly string[];
  preflightChecks: readonly RollbackStopCheck[];
  receipt_status: 'stage_executor_preflight_only';
  executionGateMessages: readonly string[];
  forbiddenActions: readonly string[];
}

export type StageExecutorReceiptStatus =
  | 'executed_stage_executor_two_files'
  | 'blocked_clean_targets_no_cached_diff'
  | 'blocked_unexpected_staged_paths'
  | 'failed';
export type StageRecoveryReceiptStatus =
  | 'executed_stage_recovery_unstage_two_files'
  | 'blocked_stage_not_executed'
  | 'failed';

export interface StageExecutorView {
  stage_executor_v0_1: true;
  stage_executor_implemented: true;
  stage_execution_approved: true;
  allowed_cwd: string;
  allowed_paths: readonly string[];
  command_descriptor: readonly string[];
  shell: false;
  git_add_dot_allowed: false;
  directory_stage_allowed: false;
  glob_stage_allowed: false;
  file_content_mutation_allowed: false;
  package_config_css_dependency_change_allowed: false;
  commit_permission: false;
  push_permission: false;
  current_execution_blocked: boolean;
  current_blocker: string;
  summary: string;
  stopConditions: readonly string[];
}

export interface StageExecutorReceiptView {
  receipt_id: string;
  approval_id: string;
  executor_mode: 'stage_executor_v0_1';
  allowed_cwd: string;
  requested_paths: readonly string[];
  staged_paths: readonly string[];
  pre_status: string;
  post_status: string;
  pre_HEAD: string;
  post_HEAD: string;
  command_exit_code: number;
  exact_path_assertion: boolean;
  no_git_add_dot_assertion: true;
  no_commit_push_assertion: true;
  package_config_css_dependency_change: false;
  receipt_status: StageExecutorReceiptStatus;
  verification_status: 'pass' | 'blocked_current_state' | 'failed';
  blocker_summary: string;
  stop_checks: readonly RollbackStopCheck[];
}

export interface StageRecoveryReceiptView {
  receipt_id: string;
  approval_id: string;
  executor_mode: 'stage_recovery_unstage_v0_1';
  allowed_cwd: string;
  requested_paths: readonly string[];
  unstaged_paths: readonly string[];
  staged_after_recovery: readonly string[];
  command_descriptor: readonly string[];
  command_exit_code: number;
  head_changed: false;
  file_content_changed: false;
  package_config_css_dependency_change: false;
  receipt_status: StageRecoveryReceiptStatus;
  verification_status: 'pass' | 'blocked_current_state' | 'failed';
  summary: string;
  stop_checks: readonly RollbackStopCheck[];
}

export interface CommitExecutorPreflightView {
  commit_executor_candidate: true;
  commit_executor_enabled: false;
  commit_execution_approved: false;
  commit_preflight_only: true;
  actual_commit_performed: false;
  push_permission: false;
  approved_message: string;
  staged_files_must_equal: readonly string[];
  summary: string;
  approvalPacketFields: readonly string[];
  receiptRequirements: readonly string[];
  preflightChecks: readonly RollbackStopCheck[];
  executionGateMessages: readonly string[];
  forbiddenActions: readonly string[];
}

export type CommitExecutorReceiptStatus =
  | 'executed_commit_executor_single_controlled_commit'
  | 'blocked_staged_files_mismatch'
  | 'blocked_message_mismatch'
  | 'blocked_protected_path_change'
  | 'failed';

export interface CommitExecutorReceiptView {
  receipt_id: string;
  approval_id: string;
  executor_mode: 'commit_executor_v0_1';
  commit_executor_implemented: true;
  commit_executor_enabled: true;
  commit_execution_approved: true;
  commit_preflight_only: false;
  actual_commit_performed: true;
  allowed_cwd: string;
  approved_message: string;
  command_descriptor: readonly string[];
  shell: false;
  commit_all_allowed: false;
  commit_a_allowed: false;
  amend_allowed: false;
  push_permission: false;
  staged_paths_before_commit: readonly string[];
  committed_files_expected: readonly string[];
  committed_files_verified: readonly string[];
  pre_HEAD: string;
  post_HEAD: string;
  commit_hash: string;
  status_after_commit: string;
  staged_after_commit: readonly string[];
  command_exit_code: number;
  head_changed: boolean;
  exact_message_assertion: boolean;
  exact_files_assertion: boolean;
  clean_worktree_assertion: boolean;
  staged_empty_assertion: boolean;
  no_push_assertion: true;
  package_config_css_dependency_change: false;
  receipt_status: CommitExecutorReceiptStatus;
  verification_status: 'pass' | 'blocked_current_state' | 'failed';
  stop_checks: readonly RollbackStopCheck[];
}

export interface CommitRecoveryPolicyView {
  mode: 'commit_recovery_policy_only';
  summary: string;
  badCommitDetection: readonly string[];
  revertVsResetPolicy: readonly string[];
  resetHardForbiddenReason: string;
  revertExecutorRequiresSeparateApproval: true;
  recoveryReceiptRequirements: readonly string[];
  DemoScenario003Scope: readonly string[];
  forbiddenActions: readonly string[];
}

export interface PushExecutorPreflightView {
  push_executor_candidate: true;
  push_executor_enabled: false;
  push_execution_approved: false;
  push_preflight_only: true;
  actual_push_performed: false;
  push_permission: false;
  remote_configured: boolean;
  upstream_configured: boolean;
  branch: string;
  candidate_remote_name: string;
  candidate_branch_refspec: string;
  credential_visibility_policy: string;
  network_policy: string;
  summary: string;
  preflightChecks: readonly RollbackStopCheck[];
  executionGateMessages: readonly string[];
  forbiddenActions: readonly string[];
}

export interface PushRemoteTargetView {
  remote_target_discovery: true;
  discovery_mode: 'local_git_metadata_only';
  remote_configured: boolean;
  upstream_configured: boolean;
  branch: string;
  head: string;
  candidate_remote_name: string;
  candidate_branch_refspec: string;
  remote_status_summary: string;
  upstream_status_summary: string;
  credential_visibility_policy: string;
  network_policy: string;
  blocker_summary: string;
  discoveryEvidence: readonly string[];
  requiredUserDecisions: readonly string[];
}

export interface PushNoExecutionCloseoutView {
  no_push_closeout: true;
  goal_id: 'DemoScenario004';
  status: 'no_push_preflight_complete';
  push_executor_implemented: false;
  push_executor_executed: false;
  actual_push_performed: false;
  remote_modified: false;
  credential_or_token_read: false;
  summary: string;
  closeoutEvidence: readonly string[];
  nextRecommendation: string;
  forbiddenCarryover: readonly string[];
}

export type PushExecutorReceiptStatus =
  | 'blocked_missing_remote_target'
  | 'blocked_push_preflight_failed'
  | 'executed_push_executor_first_controlled_push'
  | 'failed';

export interface PushExecutorApprovalPacket {
  approval_id: string;
  executor_mode: 'push_executor_candidate' | 'push_executor_execution';
  allowed_repo: string;
  allowed_cwd: string;
  approved_HEAD: string;
  remote_name: string;
  remote_url_identity: string;
  remote_url_fingerprint: string;
  local_branch: string;
  remote_branch: string;
  refspec: string;
  network_policy: string;
  credential_visibility_policy: string;
  force_push_allowed: false;
  tags_allowed: false;
  mirror_allowed: false;
  all_branches_allowed: false;
  human_review_required: true;
  Pro_gate_required: true;
  push_target_complete: boolean;
}

export interface PushExecutorContractView {
  push_executor_v0_1: true;
  push_executor_implemented: true;
  push_executor_enabled: boolean;
  push_execution_approved: boolean;
  actual_push_performed: false;
  allowed_cwd: string;
  approved_HEAD: string;
  command_descriptor: readonly string[];
  shell: false;
  remote_add_set_url_allowed: false;
  force_push_allowed: false;
  tags_allowed: false;
  mirror_allowed: false;
  all_branches_allowed: false;
  credential_print_allowed: false;
  push_target_complete: boolean;
  blocked_reason: string;
  approvalPacket: PushExecutorApprovalPacket;
  requiredTargetFields: readonly string[];
  preflightChecks: readonly RollbackStopCheck[];
  forbiddenActions: readonly string[];
  stopConditions: readonly string[];
}

export interface PushExecutorReceiptView {
  receipt_id: string;
  approval_id: string;
  executor_mode: 'push_executor_v0_1';
  receipt_status: PushExecutorReceiptStatus;
  push_executor_implemented: true;
  push_execution_approved: false;
  actual_push_performed: false;
  allowed_cwd: string;
  approved_HEAD: string;
  pre_HEAD: string;
  post_HEAD: string;
  branch: string;
  status_before: 'clean';
  staged_before: 'empty';
  command_descriptor: readonly string[];
  command_executed: false;
  command_exit_code: null;
  stdout_redacted_summary: string;
  stderr_redacted_summary: string;
  credential_or_token_printed: false;
  force_push_attempted: false;
  tags_push_attempted: false;
  mirror_push_attempted: false;
  all_branches_push_attempted: false;
  remote_modified: false;
  remote_verification_performed: false;
  verification_status: 'blocked_missing_remote_target';
  blocker_summary: string;
  stop_checks: readonly RollbackStopCheck[];
}

export interface PushRemoteVerificationView {
  remote_verification: true;
  verification_status: 'blocked_missing_remote_target' | 'verified_remote_contains_approved_commit';
  remote_configured: boolean;
  upstream_configured: boolean;
  remote_name: string;
  local_branch: string;
  remote_branch: string;
  refspec: string;
  git_remote_v_summary: string;
  git_branch_vv_summary: string;
  network_verification_performed: boolean;
  credential_or_token_printed: false;
  remote_contains_approved_commit: 'not_checked_missing_remote_target' | 'verified';
  blocker_summary: string;
  evidence: readonly string[];
}

export interface FinalExecutionChainCloseoutView {
  closeout_id: string;
  status: 'blocked_missing_remote_target' | 'executed_push_executor_first_controlled_push';
  push_executed: boolean;
  push_executor_implemented: true;
  push_execution_approved: boolean;
  actual_push_performed: boolean;
  build_passed: boolean;
  browser_smoke_passed: boolean;
  ag_sec_findings: '0/0/0';
  ag_review_findings: '0/0/0';
  pro_closeout: 'final_commit_only';
  credential_or_token_printed: false;
  force_tags_mirror_attempted: false;
  llm_wiki_real_data_other_project: false;
  summary: string;
  completedScope: readonly string[];
  remainingBlockers: readonly string[];
  nextRecommendation: string;
}

export type CapabilityFinalStatus = 'stable' | 'passed' | 'blocked_ready_no_push' | 'excluded_from_v0_1_final';

export interface CapabilityMaturityItem {
  capability: string;
  status: CapabilityFinalStatus;
  lastVerifiedGoal: string;
  evidenceType: string;
  remainingRisk: string;
  nextGateIfContinued: string;
}

export interface LocalExecutionChainFinalView {
  local_execution_chain_v0_1_final: true;
  no_push_finalization: true;
  push_execution_excluded: true;
  remote_configured: false;
  upstream_configured: false;
  push_executor_executed: false;
  summary: string;
  finalConclusion: string;
  futurePushGate: string;
  capabilityMatrix: readonly CapabilityMaturityItem[];
  finalFlags: readonly string[];
}

export interface ProductizationReadinessView {
  productization_readiness_panel: true;
  summary: string;
  stillEngineeringConsole: boolean;
  panelsToMerge: readonly string[];
  flagsToPreserve: readonly string[];
  buttonsStillForbidden: readonly string[];
  userIdeaToAgentChainSupport: string;
  recommendedNextStage: string;
  readinessChecks: ReadonlyArray<{
    question: string;
    answer: string;
  }>;
}

export interface FinalHandoffView {
  final_handoff_package: true;
  control_project_head: string;
  second_project_head: string;
  completedCapabilities: readonly string[];
  unfinishedCapabilities: readonly string[];
  forbiddenCarryoverPermissions: readonly string[];
  contextRecovery: readonly string[];
  nextChatStartupInstruction: string;
  noPushFinalizationConclusion: string;
}

export interface NoPushFinalizationView {
  no_push_finalization: true;
  route: 'Route B / No-push Finalization';
  remote_configured: false;
  upstream_configured: false;
  push_executor_executed: false;
  push_execution_excluded: true;
  git_push_executed: false;
  conclusion: string;
  evidence: readonly string[];
  futurePushRequirements: readonly string[];
}

export interface ProductStatusItem {
  label: string;
  value: string;
  status: 'pass' | 'blocked' | 'not_authorized' | 'needs_user_decision';
}

export interface ProductOverviewDashboardView {
  productName: 'AgentHub Visual Manager v0.1';
  localExecutionFinalFlag: 'local_execution_chain_v0_1_final=true';
  noPushFinalizationFlag: 'no_push_finalization=true';
  currentPhase: 'Local Complete / Remote Push Blocked';
  currentSafetyStatus: 'No Remote / No Push / No Real Data / No private knowledge base';
  currentNextDecision: 'UI/productization or remote approval';
  heroStatements: readonly string[];
  primarySignals: readonly string[];
  statusCards: readonly ProductStatusItem[];
}

export interface ExecutionChainRoadmapView {
  title: string;
  summary: string;
  steps: ReadonlyArray<{
    capability: string;
    status: 'passed' | 'blocked' | 'excluded';
    nextGate: string;
  }>;
}

export interface EvidenceSummaryView {
  summary: string;
  evidenceMode: 'summary_first_expandable_details';
  mainViewRules: readonly string[];
  cards: ReadonlyArray<{
    label: string;
    status: 'pass' | 'blocked' | 'not_authorized' | 'next_gate';
    evidence: string;
    reference: string;
  }>;
}

export interface SafetyBoundarySummaryView {
  summary: string;
  safetyFlags: readonly string[];
  preservedBoundaries: readonly string[];
}

export interface ProductNextDecisionRoute {
  route: 'A' | 'B' | 'C';
  title: string;
  summary: string;
  risk: 'low' | 'high' | 'medium-high';
  proRequired: boolean;
  highRisk: boolean;
  approvalRequired: boolean;
  recommended: boolean;
  why: string;
}

export interface ProductNextDecisionView {
  currentNextDecision: 'UI/productization or remote approval';
  routes: readonly ProductNextDecisionRoute[];
}

export interface LocalV01ProductReviewView {
  summary: string;
  answers: ReadonlyArray<{
    question: string;
    answer: string;
  }>;
}

export interface NewChatHandoffView {
  controlHead: string;
  secondProjectHead: string;
  currentCapabilityLevel: string;
  forbiddenItems: readonly string[];
  neverInheritPermissions: readonly string[];
  remotePushStatus: string;
  noPushFinalizationStatus: string;
  nextRecommendation: string;
  copyablePrompt: string;
}

export interface ProductDemoFlowView {
  title: string;
  summary: string;
  steps: ReadonlyArray<{
    step: string;
    title: string;
    status: 'complete' | 'gated' | 'excluded' | 'next_decision';
    description: string;
  }>;
  emphasis: readonly string[];
}

export interface CapabilityMaturitySummaryView {
  title: string;
  summary: string;
  items: ReadonlyArray<{
    label: string;
    status: 'passed' | 'blocked' | 'excluded' | 'next_gate';
    note: string;
  }>;
}

export interface FinalReviewScorecardView {
  title: string;
  summary: string;
  rows: ReadonlyArray<{
    category: string;
    score: string;
    status: 'high' | 'pass' | 'blocked';
    note: string;
  }>;
  readinessLevel: string;
  cloudPushReadiness: string;
}

export interface UserJourneyView {
  title: string;
  summary: string;
  stages: ReadonlyArray<{
    stage: string;
    userSees: string;
    productAnswer: string;
  }>;
}

export interface ExecutionChainReadinessView {
  chain_id: string;
  summary: string;
  readiness_status:
    | 'blocked_before_stage_execution'
    | 'ready_for_commit_gate_planning'
    | 'commit_executor_first_run_pass_push_gate_locked';
  maturity: ReadonlyArray<{
    layer: string;
    status: string;
    evidence: string;
  }>;
  next_decision: string;
  forbiddenCarryover: readonly string[];
}

export type SelectedPathWriteExecutorMode =
  | 'selected_path_write_candidate'
  | 'selected_path_write_preflight';
export type SelectedPathWriteReceiptStatus = 'pass_zero_write' | 'blocked' | 'failed' | 'unverifiable';
export type SelectedPathWriteCheckStatus = 'pass' | 'blocked';
export type SelectedPathWriteMutationExpectation = 'zero';

export interface SelectedPathWriteApprovalPacket {
  approval_id: string;
  executor_mode: 'selected_path_write_candidate';
  allowed_repo: string;
  allowed_cwd: string;
  allowed_target_paths: readonly string[];
  forbidden_paths: readonly string[];
  max_files: number;
  max_bytes: number;
  expected_diff_summary: string;
  preimage_required: true;
  postimage_required: true;
  rollback_strategy: string;
  stop_conditions: readonly string[];
  human_review_required: true;
  pro_gate_required: true;
  mutation_expectation: SelectedPathWriteMutationExpectation;
}

export interface SelectedPathWriteTargetMetadata {
  path: string;
  byteSize: number;
  preimageSha256: string;
  metadataSource: string;
}

export interface SelectedPathWriteStopCheck {
  id: string;
  label: string;
  status: SelectedPathWriteCheckStatus;
  evidence: string;
}

export interface SelectedPathWritePreflightReceipt {
  approval_id: string;
  executor_mode: 'selected_path_write_preflight';
  allowed_repo: string;
  allowed_cwd: string;
  target_paths_checked: readonly string[];
  forbidden_paths_checked: readonly string[];
  preimage_hash_status: 'recorded' | 'missing';
  expected_diff_status: 'recorded' | 'missing';
  rollback_strategy_status: 'recorded' | 'missing';
  zero_write_assertion: true;
  receipt_status: SelectedPathWriteReceiptStatus;
  stop_checks: readonly SelectedPathWriteStopCheck[];
}

export interface SelectedPathWriteExecutorPrototypeView {
  selected_path_write_executor_candidate: true;
  write_executor_enabled: false;
  write_execution_approved: false;
  preflight_only: true;
  actual_write_performed: false;
  stage_permission: false;
  commit_permission: false;
  push_permission: false;
  npm_permission: false;
  package_config_css_dependency_change: false;
  disabled_reason: string;
  approvalPacket: SelectedPathWriteApprovalPacket;
  targetMetadata: SelectedPathWriteTargetMetadata;
  implementationPlan: readonly string[];
  nextGateMessages: readonly string[];
}

export interface SelectedPathWritePreflightView {
  mode: 'zero_write_selected_path_preflight';
  summary: string;
  receipt: SelectedPathWritePreflightReceipt;
  packet: SelectedPathWriteApprovalPacket;
  targetMetadata: SelectedPathWriteTargetMetadata;
  checks: readonly SelectedPathWriteStopCheck[];
  zeroWriteEvidence: readonly string[];
}

export interface WriteExecutorBoundaryView {
  boundaryMode: 'selected_path_write_preflight_only';
  summary: string;
  allowedNow: readonly string[];
  forbiddenNow: readonly string[];
  futureGoalGates: readonly string[];
  stopConditions: readonly string[];
}

export type RollbackMode = 'selected_path_rollback_preflight';
export type RollbackType = 'restore_preimage' | 'delete_created_file';
export type RollbackPreflightStatus = 'pass_zero_mutation' | 'blocked';
export type RollbackCheckStatus = 'pass' | 'blocked';
export type RollbackReceiptValidatorStatus = 'pass' | 'blocked' | 'unverifiable';

export interface RollbackApprovalPacket {
  approval_id: string;
  rollback_mode: RollbackMode;
  allowed_repo: string;
  allowed_cwd: string;
  allowed_target_paths: readonly string[];
  forbidden_paths: readonly string[];
  rollback_type: RollbackType;
  preimage_hash: string;
  current_hash: string;
  expected_post_rollback_hash: string;
  max_files: 1;
  max_bytes: number;
  human_review_required: true;
  pro_gate_required: true;
  stop_conditions: readonly string[];
  mutation_expectation: 'zero_for_preflight';
  actual_rollback_performed: false;
}

export interface RollbackTargetMetadata {
  path: string;
  currentByteSize: number;
  currentHash: string;
  preimageByteSize: number;
  preimageHash: string;
  expectedPostRollbackHash: string;
  metadataSource: string;
}

export interface RollbackStopCheck {
  id: string;
  label: string;
  status: RollbackCheckStatus;
  evidence: string;
}

export interface RollbackPreflightReceipt {
  approval_id: string;
  rollback_mode: RollbackMode;
  target_paths_checked: readonly string[];
  rollback_type: RollbackType;
  preimage_hash_status: 'recorded' | 'missing';
  current_hash_status: 'recorded' | 'missing';
  expected_post_rollback_hash_status: 'recorded' | 'missing';
  mutation_expectation: 'zero_for_preflight';
  actual_rollback_performed: false;
  receipt_status: RollbackPreflightStatus;
  zero_mutation_assertion: true;
  stop_checks: readonly RollbackStopCheck[];
}

export interface RollbackReceiptTemplate {
  approval_id: string;
  rollback_mode: RollbackMode;
  target_paths: readonly string[];
  pre_rollback_hash: string;
  post_rollback_hash: string;
  changed_files: readonly string[];
  diff_summary: string;
  zero_extra_mutation_assertion: true;
  staged_status: 'empty';
  receipt_status: 'preflight_only_not_executed';
  verification_status: 'validated_template_only';
  recovery_note: string;
}

export interface RollbackReceiptValidatorEvidence {
  validator_id: string;
  status: RollbackReceiptValidatorStatus;
  required_fields: readonly string[];
  checks: readonly RollbackStopCheck[];
  conclusion: string;
}

export interface RollbackRecoveryPolicyView {
  rollback_recovery_candidate: true;
  rollback_execution_approved: false;
  rollback_executor_enabled: false;
  rollback_preflight_only: true;
  actual_rollback_performed: false;
  stage_permission: false;
  commit_permission: false;
  push_permission: false;
  summary: string;
  policyPoints: readonly string[];
  allowedRollbackTypes: readonly string[];
  forbiddenActions: readonly string[];
  executionGateMessages: readonly string[];
}

export interface RollbackRecoveryPrototypeView {
  prototype_id: string;
  rollback_recovery_candidate: true;
  rollback_executor_enabled: false;
  rollback_execution_approved: false;
  rollback_preflight_only: true;
  actual_rollback_performed: false;
  stage_permission: false;
  commit_permission: false;
  push_permission: false;
  approvalPacket: RollbackApprovalPacket;
  targetMetadata: RollbackTargetMetadata;
  implementationPlan: readonly string[];
  disabledReason: string;
}

export interface RollbackPreflightView {
  mode: 'rollback_recovery_preflight_only';
  summary: string;
  receipt: RollbackPreflightReceipt;
  packet: RollbackApprovalPacket;
  targetMetadata: RollbackTargetMetadata;
  receiptTemplate: RollbackReceiptTemplate;
  validatorEvidence: RollbackReceiptValidatorEvidence;
  zeroMutationEvidence: readonly string[];
}

export interface RollbackRecoveryCloseoutView {
  status: 'rollback_recovery_v0_1_preflight_closed';
  summary: string;
  completedScope: readonly string[];
  remainingBoundaries: readonly string[];
  DemoScenario052Scope: readonly string[];
  nextDecision: string;
}

export interface FixtureRiskRecord {
  riskId: string;
  severity: Severity;
  description: string;
  mitigation: string;
  blocking: boolean;
  owner: AgentId;
  sourceRef: string;
}

export interface FixtureProvenanceRecord {
  sourcePath: string;
  sourceHash: string;
  readMode: ImportSource;
  confidence: 'high' | 'medium' | 'low';
  limitation: string;
}

export interface ImportFileNotice {
  path: string;
  reason: string;
}

export interface AgentHubImportStatus {
  state: ImportState;
  source: ImportSource;
  readMode: ImportSource;
  importedFiles: string[];
  skippedFiles: ImportFileNotice[];
  blockedFiles: ImportFileNotice[];
  warnings: string[];
  unsupportedFiles: string[];
  lastImportedAt: string | null;
  readOnly: true;
  executionConnected: false;
  totalBytes: number;
}

export interface BasicAgentHubFixture {
  project: FixtureProjectRecord;
  gates: FixtureGateRecord[];
  agents: FixtureAgentRecord[];
  tasks: FixtureTaskRecord[];
  runs: FixtureRunRecord[];
  reviews: FixtureReviewRecord[];
  decisions: FixtureDecisionRecord[];
  risks: FixtureRiskRecord[];
  provenance: FixtureProvenanceRecord[];
}

export interface ImportedAgentHubProject {
  project: {
    projectId: string;
    projectName: string;
    currentGoal: string;
    currentPhase: string;
    stableBaseline: string;
    buildStatus: string;
    repoStatus: string;
    commitGate: string;
  };
  gates: FixtureGateRecord[];
  agents: FixtureAgentRecord[];
  tasks: FixtureTaskRecord[];
  runs: FixtureRunRecord[];
  reviews: FixtureReviewRecord[];
  decisions: FixtureDecisionRecord[];
  risks: FixtureRiskRecord[];
  provenance: FixtureProvenanceRecord[];
  importStatus: AgentHubImportStatus;
}

export type ParserFixtureDocumentKind =
  | 'project-state'
  | 'task'
  | 'run'
  | 'review'
  | 'goal'
  | 'receipt'
  | 'next-decision';

export type ParserFixtureScenarioKind =
  | 'valid_fixture_parsed'
  | 'missing_task_file'
  | 'duplicate_id'
  | 'stale_status'
  | 'conflicting_review'
  | 'missing_approval'
  | 'unverifiable_receipt'
  | 'unsafe_path_flag'
  | 'next_decision_extracted'
  | 'real_action_gates_locked';

export interface ParserFixtureDocument {
  path: string;
  kind: ParserFixtureDocumentKind;
  id: string;
  title: string;
  status: string;
  body: string;
  refs: string[];
}

export interface ParserFixtureScenario {
  scenarioId: string;
  kind: ParserFixtureScenarioKind;
  severity: 'info' | 'warning' | 'blocked';
  sourcePath: string;
  message: string;
}

export interface AgentHubParserFixture {
  fixtureId: string;
  parserMode: 'fixture_only';
  readOnly: true;
  realAgentHubImport: false;
  fsAccess: false;
  executorConnected: false;
  writeAccess: false;
  sourceNote: string;
  documents: ParserFixtureDocument[];
  scenarios: ParserFixtureScenario[];
}

export interface ParsedAgentHubWarning {
  warningId: string;
  severity: 'info' | 'warning' | 'blocked';
  scenario: ParserFixtureScenarioKind;
  sourcePath: string;
  message: string;
}

export interface ParsedAgentHubTestResult {
  scenario: ParserFixtureScenarioKind;
  result: 'pass';
  evidence: string;
}

export interface ParsedAgentHubViewModel {
  parserName: 'fixture-only read-only parser prototype';
  fixtureId: string;
  fixtureOnlyParser: true;
  realAgentHubImport: false;
  fsAccess: false;
  readOnly: true;
  executorConnected: false;
  writeAccess: false;
  state: ImportState;
  parsedFiles: string[];
  project: {
    projectId: string;
    currentGoal: string;
    stableBaseline: string;
  };
  counts: {
    projectState: number;
    tasks: number;
    runs: number;
    reviews: number;
    goals: number;
    receipts: number;
    nextDecisions: number;
  };
  warnings: ParsedAgentHubWarning[];
  blockedScenarios: ParsedAgentHubWarning[];
  nextDecision: {
    optionId: string;
    title: string;
    status: 'needs_user_decision';
    sourcePath: string;
  };
  lockedGates: Array<{
    gateId: string;
    locked: true;
    value: boolean;
    label: string;
  }>;
  testMatrix: ParsedAgentHubTestResult[];
}

export type SampleImportDocumentKind =
  | 'project-state'
  | 'task'
  | 'run'
  | 'review'
  | 'goal'
  | 'receipt'
  | 'next-decision';

export interface SampleImportDocument {
  path: string;
  kind: SampleImportDocumentKind;
  id: string;
  title: string;
  status: string;
  preview: string;
  sourceRef: string;
  byteSize: number;
}

export interface BrowserSampleImportBundle {
  bundleId: string;
  sourceMode: 'bundled_synthetic_sample';
  browserOnlySampleImport: true;
  realAgentHubImport: false;
  fileUploadEnabled: false;
  directoryPickerEnabled: false;
  fsAccess: false;
  backendRead: false;
  localPathRead: false;
  executorConnected: false;
  writeAccess: false;
  approvalGranted: false;
  parserOutputRole: 'recommendation_signal_only';
  sourceNote: string;
  documents: SampleImportDocument[];
  deniedCapabilities: string[];
}

export interface SampleImportPreviewStage {
  stageId: 'sample_bundle' | 'parser' | 'parsed_preview';
  label: string;
  status: 'ready' | 'parsed' | 'preview_only';
  detail: string;
}

export interface SampleImportPreviewViewModel {
  previewId: string;
  sourceMode: 'bundled_synthetic_sample';
  browserOnlySampleImport: true;
  realAgentHubImport: false;
  fileUploadEnabled: false;
  directoryPickerEnabled: false;
  fsAccess: false;
  backendRead: false;
  localPathRead: false;
  readOnly: true;
  approvalGranted: false;
  parserOutputRole: 'recommendation_signal_only';
  state: 'parsed_preview';
  chain: SampleImportPreviewStage[];
  safetyFlags: Array<{
    label: string;
    value: string;
  }>;
  parsedPreview: {
    bundleId: string;
    documentCount: number;
    totalBytes: number;
    categories: Record<SampleImportDocumentKind, number>;
    nextDecision: string;
    recommendationSignal: string;
  };
  documents: SampleImportDocument[];
  deniedCapabilities: string[];
  approvalBoundary: string[];
}

export type SelectedFileImportDocumentKind =
  | SampleImportDocumentKind
  | 'boundary'
  | 'unknown';

export type SelectedFileImportState = 'idle' | 'parsed_preview' | 'partial' | 'blocked';

export interface SelectedFileImportLimits {
  allowedExtensions: string[];
  maxFileCount: number;
  maxTotalBytes: number;
}

export interface SelectedFileImportNotice {
  fileName: string;
  reason: string;
}

export interface SelectedFileImportSafetyWarning {
  warningId:
    | 'tainted_import_text'
    | 'unsupported_or_blocked_file'
    | 'unsafe_path_signal'
    | 'missing_reference_signal'
    | 'duplicate_signal'
    | 'stale_state_signal'
    | 'unverifiable_receipt_signal'
    | 'no_warning_signal_detected';
  severity: 'info' | 'warning' | 'blocked';
  label: string;
  detail: string;
  evidence: string;
}

export interface SelectedFileImportRecord {
  fileName: string;
  kind: SelectedFileImportDocumentKind;
  extension: string;
  byteSize: number;
  status: 'accepted_preview';
  sourceRef: string;
  taint: 'untrusted_user_selected_file';
  preview: string;
}

export interface SelectedFileImportViewModel {
  importId: string;
  state: SelectedFileImportState;
  limits: SelectedFileImportLimits;
  selectedFileImportEnabled: true;
  browserOnlyImport: true;
  directoryPickerEnabled: false;
  fsAccess: false;
  backendImport: false;
  fileUploadImplemented: false;
  writePermission: false;
  executorPermission: false;
  gitPermission: false;
  npmPermission: false;
  wikiPermission: false;
  pushPermission: false;
  approvalGranted: false;
  parserOutputRole: 'recommendation_signal_only';
  totalSelectedFiles: number;
  totalBytes: number;
  acceptedFiles: SelectedFileImportRecord[];
  blockedFiles: SelectedFileImportNotice[];
  warnings: string[];
  safetyWarnings: SelectedFileImportSafetyWarning[];
  categories: Record<SelectedFileImportDocumentKind, number>;
  safetyFlags: Array<{
    label: string;
    value: string;
  }>;
}

export type InstructionDraftGeneratorState = 'waiting_for_selection' | 'ready' | 'needs_review' | 'blocked';

export type InstructionDraftSectionId =
  | 'goal'
  | 'current_baseline'
  | 'allowed'
  | 'inherited_boundaries'
  | 'stop_if'
  | 'exact_paths'
  | 'dod'
  | 'report_fields';

export interface InstructionDraftSection {
  sectionId: InstructionDraftSectionId;
  label: string;
  lines: string[];
}

export interface InstructionDraftGeneratorViewModel {
  draftId: string;
  state: InstructionDraftGeneratorState;
  statusLabel: string;
  instructionDraftOnly: true;
  autoSendEnabled: false;
  autoExecuteEnabled: false;
  importedContentAsInstruction: false;
  requiresHumanCopyAndApproval: true;
  executorPermission: false;
  writePermission: false;
  pushPermission: false;
  generatedDraftIsApproval: false;
  sourceSummary: {
    importState: SelectedFileImportState;
    totalSelectedFiles: number;
    acceptedFiles: number;
    blockedFiles: number;
    totalBytes: number;
    acceptedFileMetadata: string[];
    parserOutputRole: 'recommendation_signal_only';
    warningCount: number;
  };
  safetyFlags: Array<{
    label: string;
    value: string;
  }>;
  taintNotes: string[];
  downgradeReasons: string[];
  sections: InstructionDraftSection[];
  plainTextDraft: string;
  nextRecommendation: string;
}

export type HandoffStageStatus = 'ready' | 'manual_required' | 'mock_pending' | 'review_required' | 'locked';

export interface SemiAutoHandoffStage {
  stageId: string;
  title: string;
  status: HandoffStageStatus;
  summary: string;
  evidence: string;
}

export interface HandoffSafetyFlag {
  label: string;
  value: string;
}

export interface HumanApprovalChecklistItem {
  id: string;
  label: string;
  labelZh: string;
  summary: string;
}

export interface HandoffEvidenceRecord {
  id: string;
  title: string;
  status: 'visible' | 'required' | 'blocked';
  evidence: string;
  receipt: string;
  boundary: string;
}

export interface HandoffEvidenceView {
  mode: 'supervised_handoff_evidence_mock';
  summary: string;
  safetyFlags: HandoffSafetyFlag[];
  evidenceRecords: HandoffEvidenceRecord[];
  receiptRequirements: string[];
  blockedRealActions: string[];
}

export interface ActionQueueMockItem {
  queueId: string;
  actionId: string;
  approvalId: string;
  envelopeHash: string;
  riskLevel: 'low_noop' | 'medium_review_required' | 'blocked_real_action';
  allowedScope: string[];
  forbiddenActions: string[];
  requiredReviews: string[];
  proposedAction: string;
  requiredApproval: string;
  requiredReview: string;
  requiredReceipt: string;
  blockedReason: string;
  nextDecision: string;
}

export interface ActionQueueMockView {
  actionQueueMockOnly: true;
  executorImplemented: false;
  executorPermission: false;
  autoExecuteEnabled: false;
  autoSendEnabled: false;
  writePermission: false;
  gitActionPermission: false;
  npmActionPermission: false;
  pushPermission: false;
  queuePolicy: string;
  deniedControls: string[];
  items: ActionQueueMockItem[];
}

export type NoopExecutorScenarioKind =
  | 'valid_noop_fixture_receipt'
  | 'missing_approval'
  | 'missing_envelope_hash'
  | 'malformed_queue_item'
  | 'risk_mismatch'
  | 'forbidden_action_requested'
  | 'attempted_shell_npm_git_write'
  | 'unverifiable_receipt'
  | 'final_git_status_fixture_mismatch'
  | 'simulated_only_false';
export type NoopExecutorScenarioStatus = 'pass' | 'blocked' | 'failed' | 'unverifiable';
export type NoopExecutorReceiptStatus = 'simulated_noop' | 'blocked' | 'failed';
export type NoopExecutorVerificationStatus =
  | 'verified_simulated_only'
  | 'blocked_unverifiable'
  | 'failed_verification';
export type NoopExecutorFinalGitStatusFixture =
  | 'clean_staged_empty_fixture'
  | 'dirty_fixture_mismatch'
  | 'not_checked_fixture';

export interface NoopExecutorScenario {
  scenarioId: string;
  title: string;
  kind: NoopExecutorScenarioKind;
  expectedStatus: NoopExecutorScenarioStatus;
  queueItem: ActionQueueMockItem;
  finalGitStatusFixture?: NoopExecutorFinalGitStatusFixture;
  forceUnverifiableReceipt?: boolean;
  simulatedOnlyOverride?: boolean;
}

export interface NoopExecutorFixtureReceipt {
  scenario_id: string;
  scenario_title: string;
  scenario_kind: NoopExecutorScenarioKind;
  scenario_status: NoopExecutorScenarioStatus;
  action_id: string;
  approval_id: string;
  envelope_hash: string;
  executor_mode: 'noop_fixture';
  dry_run_type: 'simulated_action_queue_contract_check';
  receipt_status: NoopExecutorReceiptStatus;
  simulated_only: boolean;
  real_executor_implemented: false;
  shell_access: false;
  npm_action: false;
  git_action: false;
  write_action: false;
  external_action: false;
  no_file_change_assertion: true;
  final_git_status_fixture: NoopExecutorFinalGitStatusFixture;
  blocked_reason: string;
  verification_status: NoopExecutorVerificationStatus;
  receipt_verification_status: NoopExecutorVerificationStatus;
  final_git_status_matches_fixture: boolean;
  simulated_only_assertion: boolean;
  synthetic_blocked_scenario: boolean;
  contract_fields_valid: boolean;
  forbidden_actions_detected: string[];
  required_reviews_present: boolean;
  consumed_queue_item_id: string;
  executed_command_count: 0;
  files_changed_count: 0;
  verification_notes: string[];
}

export interface NoopExecutorScenarioResult {
  scenario: NoopExecutorScenario;
  receipt: NoopExecutorFixtureReceipt;
}

export interface SemiAutoLoopReadiness {
  canEnterNoopExecutorControlledLoopMock: boolean;
  actionQueueLoopUiAllowed: boolean;
  humanApprovalRequired: boolean;
  realExecutorAllowed: false;
  writeShellNpmGitPushAllowed: false;
  readinessConclusion: string;
  conditionsBlockingRealExecutor: string[];
  allowedNextMockSteps: string[];
  forbiddenRealActions: string[];
}

export type SemiAutoActionLoopStageStatus =
  | 'ready'
  | 'generated'
  | 'reviewed'
  | 'mock_pending'
  | 'proposed'
  | 'simulated_receipt'
  | 'review_gate'
  | 'commit_gate';

export interface SemiAutoActionLoopStage {
  stageId: string;
  title: string;
  titleZh: string;
  status: SemiAutoActionLoopStageStatus;
  evidence: string;
  boundary: string;
}

export interface ExecutorActionLevel {
  level: ActionLevel;
  label: string;
  allowedInCurrentGoal: boolean;
  requiredApproval: string;
  boundary: string;
}

export interface ExecutorSandboxBoundaryView {
  sandboxMode: 'architecture_mock_only' | 'noop_fixture_mock';
  executorImplemented: false;
  executorPermission: false;
  writePermission: false;
  gitActionPermission: false;
  npmActionPermission: false;
  pushPermission: false;
  actionLevels: ExecutorActionLevel[];
  preconditions: string[];
  stopConditions: string[];
  receiptRequirements: string[];
  rollbackRecoveryRequirements: string[];
  whyNotImplementedThisGoal: string[];
  DemoScenario034Recommendation: string;
}

export type ReadonlyMetadataExecutorCommandId =
  | 'git_status_short'
  | 'git_status_branch'
  | 'git_rev_parse_head'
  | 'git_branch_show_current'
  | 'git_diff_cached_name_only';

export type ReadonlyMetadataExecutorReceiptStatus = 'not_executed_prototype';
export type ReadonlyMetadataExecutionReceiptStatus =
  | 'executed_readonly_metadata_zero_mutation'
  | 'executed_readonly_metadata_requires_review'
  | 'blocked_command_mismatch'
  | 'blocked_cwd_mismatch'
  | 'blocked_dirty_repo'
  | 'blocked_staged_files'
  | 'failed_command_timeout'
  | 'failed_command_exit_nonzero'
  | 'unverifiable_missing_receipt_fields'
  | 'blocked_head_mismatch'
  | 'blocked_status_unexpected'
  | 'blocked_redaction_failure';
export type ReadonlyMetadataStopOutcome = 'blocked' | 'failed' | 'unverifiable';
export type ReadonlyMetadataRetryPolicy =
  | 'not_allowed'
  | 'manual_reauthorization_required'
  | 'not_automatic'
  | 'not_needed';

export interface ReadonlyMetadataCommandDescriptor {
  id: ReadonlyMetadataExecutorCommandId;
  label: string;
  executable: 'git';
  argv: readonly string[];
  shell: false;
  cwdPolicy: 'fixed_allowed_cwd';
  mutationRisk: 'read_only_metadata';
  purpose: string;
}

export interface ReadonlyMetadataReceiptPreview {
  receipt_status: ReadonlyMetadataExecutorReceiptStatus;
  prototype_implemented: true;
  prototype_executed: false;
  executor_executed: false;
  allowed_repo: string;
  allowed_cwd: string;
  allowed_commands_count: number;
  executed_command_count: 0;
  files_changed_count: 0;
  no_file_change_assertion: true;
  command_results: readonly [];
  redaction_hooks: readonly string[];
  output_summary_placeholder: string;
  stop_condition: string;
  stop_retry_policy?: readonly ReadonlyMetadataStopRetryPolicyItem[];
  receipt_qa_required_fields?: readonly string[];
  hardening_scenarios?: readonly ReadonlyMetadataHardeningScenario[];
}

export interface ReadonlyMetadataExecutorPrototypeView {
  readonly_metadata_executor_prototype: true;
  prototype_implemented: true;
  prototype_executed: false;
  executor_executed: false;
  allowedRepo: string;
  allowedCwd: string;
  allowedCommands: readonly ReadonlyMetadataCommandDescriptor[];
  allowedCommandsCount: number;
  shellMode: false;
  writePermission: false;
  stagePermission: false;
  commitPermission: false;
  pushPermission: false;
  npmPermission: false;
  backendFsPermission: false;
  localPathReadPermission: false;
  receiptPreview: ReadonlyMetadataReceiptPreview;
  statusMessage: string;
  nextGateMessage: string;
  safetyNotes: readonly string[];
  forbiddenActions: readonly string[];
}

export interface ReadonlyMetadataStopRetryPolicyItem {
  condition: string;
  receipt_status: ReadonlyMetadataExecutionReceiptStatus;
  outcome: ReadonlyMetadataStopOutcome;
  retry: ReadonlyMetadataRetryPolicy;
  evidence: string;
}

export interface ReadonlyMetadataReceiptQaCheck {
  field: string;
  status: 'pass' | 'missing';
}

export interface ReadonlyMetadataHardeningScenario {
  scenario: string;
  outcome: ReadonlyMetadataStopOutcome;
  retry: ReadonlyMetadataRetryPolicy;
}

export interface ReadonlyMetadataExecutorCommandResult {
  step: string;
  id: ReadonlyMetadataExecutorCommandId;
  command: string;
  executable: 'git';
  argv: readonly string[];
  shell: false;
  cwd: string;
  exit_code: number;
  signal: string | null;
  stdout: string;
  stderr_summary: string;
}

export interface ReadonlyMetadataExecutorExecutionReceipt {
  receipt_id: string;
  approval_id: string;
  executor_mode: 'read_only_metadata_executor_v0_1';
  receipt_status: ReadonlyMetadataExecutionReceiptStatus;
  allowed_cwd: string;
  allowed_repo: string;
  requested_commands: readonly string[];
  executed_commands: readonly string[];
  baseline_head: string;
  current_head: string;
  branch: string;
  status_summary: string;
  staged_summary: string;
  zero_mutation_assertion: boolean;
  actual_commands: readonly string[];
  command_exit_codes: Record<string, number>;
  command_results: readonly ReadonlyMetadataExecutorCommandResult[];
  redaction_status: string;
  stop_checks: Record<string, boolean>;
  retry_policy: ReadonlyMetadataRetryPolicy;
  receipt_qa_required_fields: readonly string[];
  receipt_qa_checks: readonly ReadonlyMetadataReceiptQaCheck[];
  receipt_qa_status: 'pass' | 'unverifiable';
  stop_retry_policy: readonly ReadonlyMetadataStopRetryPolicyItem[];
  hardening_scenarios: readonly ReadonlyMetadataHardeningScenario[];
  mutation_checks: {
    baseline_status_short: string;
    post_status_short: string;
    baseline_staged: string;
    post_staged: string;
    baseline_head: string;
    post_head: string;
  };
}

/* ============================================================
 * v0.2 Cockpit view models (DemoScenario012-E, 2099-01-01 refactor)
 * 详见 docs/REFACTOR-LOG-20990101.md
 * ============================================================ */

/** 数据源类型：mock 演示 / 目录只读导入 / 本地服务实时同步（v0.5） */
export type ProjectDataSourceKind = 'mock' | 'imported' | 'server';

/** 左侧导航条目状态：诚实导航要求——不允许假装可点的死链接 */
export type NavSectionState = 'active' | 'available' | 'planned';

export interface NavSectionViewModel {
  /** 页面内锚点 id（state=planned 时无锚点） */
  id: string;
  label: string;
  state: NavSectionState;
  description: string;
}

export type AgentRelationType =
  | 'dispatch'
  | 'execution'
  | 'review'
  | 'approval'
  | 'handoff'
  | 'information';

export type AgentRelationStatus = 'active' | 'waiting' | 'blocked' | 'complete';

export interface AgentRelationViewModel {
  id: string;
  fromAgent: string;
  toAgent: string;
  type: AgentRelationType;
  typeLabel: string;
  status: AgentRelationStatus;
  label: string;
}

export type EvidenceAudience = 'user' | 'developer' | 'auditor';

export interface EvidenceCategoryViewModel {
  id: string;
  label: string;
  status: string;
  summary: string;
  items: readonly string[];
  audience: EvidenceAudience;
}

export interface CockpitViewModel {
  sourceKind: ProjectDataSourceKind;
  sourceLabel: string;
  nav: readonly NavSectionViewModel[];
  relations: readonly AgentRelationViewModel[];
  evidence: readonly EvidenceCategoryViewModel[];
}
