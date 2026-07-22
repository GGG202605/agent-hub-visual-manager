import type {
  ActionGatePilot,
  ActionQueueMockView,
  CommitGateEvidenceView,
  DashboardState,
  ExecutorSandboxBoundaryView,
  ActionQueueMockItem,
  HandoffEvidenceView,
  ImportedAgentHubProject,
  NoopExecutorFixtureReceipt,
  NoopExecutorScenarioResult,
  ParsedAgentHubViewModel,
  RealExecutorPregateView,
  SampleImportPreviewViewModel,
  SemiAutoLoopReadiness,
} from '../types';
import {
  evidenceSummaryView,
  executionChainRoadmapView,
  finalHandoffView,
  localExecutionChainFinalView,
  localV01ProductReviewView,
  newChatHandoffView,
  noPushFinalizationView,
  capabilityMaturitySummaryView,
  finalReviewScorecardView,
  productDemoFlowView,
  productNextDecisionView,
  productOverviewDashboardView,
  productizationReadinessView,
  readonlyMetadataExecutorExecutionReceipt,
  readonlyMetadataExecutorStabilityView,
  safetyBoundarySummaryView,
  userJourneyView,
} from '../data/mockAgentHub';
import { readonlyMetadataExecutorPrototypeView } from '../lib/readonlyMetadataExecutorContract';
import {
  selectedPathWriteApprovalPacket,
  selectedPathWriteBoundaryView,
  selectedPathWriteExecutorPrototypeView,
  selectedPathWritePreflightReceipt,
  selectedPathWriteTargetMetadata,
} from '../lib/selectedPathWriteExecutorContract';
import { buildExecutorReceiptView, buildExecutorView } from '../lib/buildExecutorContract';
import {
  commitExecutionChainReadinessView,
  commitExecutorReceiptView,
  commitRecoveryPolicyView,
} from '../lib/commitExecutorContract';
import { commitExecutorPreflightView } from '../lib/commitExecutorPreflightContract';
import { multiFileWriteReceipt, multiFileWriteView } from '../lib/multiFileSelectedPathWriteContract';
import {
  pushExecutorPreflightView,
  pushNoExecutionCloseoutView,
  pushRemoteTargetView,
} from '../lib/pushExecutorPreflightContract';
import { pushExecutorContractView } from '../lib/pushExecutorContract';
import {
  finalExecutionChainCloseoutView,
  pushExecutorReceiptView,
  pushRemoteVerificationView,
} from '../lib/pushExecutorReceiptContract';
import {
  rollbackPreflightView,
  rollbackRecoveryCloseoutView,
  rollbackRecoveryPolicyView,
  rollbackRecoveryPrototypeView,
} from '../lib/rollbackRecoveryContract';
import {
  stageExecutorReceiptView,
  stageExecutorView,
  stageRecoveryReceiptView,
} from '../lib/stageExecutorContract';
import { stageExecutorPreflightView } from '../lib/stageExecutorPreflightContract';
import { ActionQueueMockPanel } from './ActionQueueMockPanel';
import { BuildExecutorPanel } from './BuildExecutorPanel';
import { BuildExecutorReceiptPanel } from './BuildExecutorReceiptPanel';
import { CapabilityMaturitySummaryPanel } from './CapabilityMaturitySummaryPanel';
import { CommitGateEvidencePanel } from './CommitGateEvidencePanel';
import { CommitExecutorReceiptPanel } from './CommitExecutorReceiptPanel';
import { CommitRecoveryPolicyPanel } from './CommitRecoveryPolicyPanel';
import { ExecutorSandboxBoundaryPanel } from './ExecutorSandboxBoundaryPanel';
import { ExecutionChainReadinessPanel } from './ExecutionChainReadinessPanel';
import { FinalExecutionChainCloseoutPanel } from './FinalExecutionChainCloseoutPanel';
import { FinalHandoffPanel } from './FinalHandoffPanel';
import { FinalReviewScorecardPanel } from './FinalReviewScorecardPanel';
import { GateOverviewPanel } from './GateOverviewPanel';
import { HandoffEvidencePanel } from './HandoffEvidencePanel';
import { HumanApprovalWorkflowPanel } from './HumanApprovalWorkflowPanel';
import { EvidenceSummaryPanel } from './EvidenceSummaryPanel';
import { ExecutionChainRoadmapPanel } from './ExecutionChainRoadmapPanel';
import { LocalExecutionChainFinalPanel } from './LocalExecutionChainFinalPanel';
import { LocalV01ProductReviewPanel } from './LocalV01ProductReviewPanel';
import { LoopReadinessPanel } from './LoopReadinessPanel';
import { MultiFileWriteExecutorPanel } from './MultiFileWriteExecutorPanel';
import { MultiFileWriteReceiptPanel } from './MultiFileWriteReceiptPanel';
import { NewChatHandoffPanel } from './NewChatHandoffPanel';
import { NextDecisionPanel } from './NextDecisionPanel';
import { NoopExecutorReceiptPanel } from './NoopExecutorReceiptPanel';
import { NoPushFinalizationPanel } from './NoPushFinalizationPanel';
import { PanelIndexCard } from './PanelIndexCard';
import { ParserPrototypePanel } from './ParserPrototypePanel';
import { PermissionSandboxPanel } from './PermissionSandboxPanel';
import { ProductNextDecisionPanel } from './ProductNextDecisionPanel';
import { ProductDemoFlowPanel } from './ProductDemoFlowPanel';
import { ProductOverviewDashboard } from './ProductOverviewDashboard';
import { ProductizationReadinessPanel } from './ProductizationReadinessPanel';
import { PushExecutorPreflightPanel } from './PushExecutorPreflightPanel';
import { PushExecutorReceiptPanel } from './PushExecutorReceiptPanel';
import { PushNoExecutionCloseoutPanel } from './PushNoExecutionCloseoutPanel';
import { PushRemoteVerificationPanel } from './PushRemoteVerificationPanel';
import { PushRemoteTargetPanel } from './PushRemoteTargetPanel';
import { RealExecutorPregatePanel } from './RealExecutorPregatePanel';
import { ReadonlyMetadataExecutorPrototypePanel } from './ReadonlyMetadataExecutorPrototypePanel';
import { ReadonlyMetadataExecutorReceiptPanel } from './ReadonlyMetadataExecutorReceiptPanel';
import { ReadonlyMetadataExecutorStabilityPanel } from './ReadonlyMetadataExecutorStabilityPanel';
import { ReceiptTimelinePanel } from './ReceiptTimelinePanel';
import { RollbackPreflightReceiptPanel } from './RollbackPreflightReceiptPanel';
import { RollbackRecoveryCloseoutPanel } from './RollbackRecoveryCloseoutPanel';
import { RollbackRecoveryPolicyPanel } from './RollbackRecoveryPolicyPanel';
import { RollbackRecoveryPrototypePanel } from './RollbackRecoveryPrototypePanel';
import { SafetyBoundarySummaryPanel } from './SafetyBoundarySummaryPanel';
import { SampleImportPreviewPanel } from './SampleImportPreviewPanel';
import { SelectedFileImportPanel } from './SelectedFileImportPanel';
import { SelectedPathWriteExecutorPrototypePanel } from './SelectedPathWriteExecutorPrototypePanel';
import { SelectedPathWritePreflightPanel } from './SelectedPathWritePreflightPanel';
import { SemiAutoActionLoopPanel } from './SemiAutoActionLoopPanel';
import { SemiAutoHandoffPanel } from './SemiAutoHandoffPanel';
import { StageExecutorPreflightPanel } from './StageExecutorPreflightPanel';
import { StageExecutorReceiptPanel } from './StageExecutorReceiptPanel';
import { StageRecoveryReceiptPanel } from './StageRecoveryReceiptPanel';
import { WriteExecutorBoundaryPanel } from './WriteExecutorBoundaryPanel';
import { UserJourneyPanel } from './UserJourneyPanel';

interface ControlConsolePanelProps {
  project: ImportedAgentHubProject;
  dashboard: DashboardState;
  gatePilot: ActionGatePilot;
  commitGateEvidence: CommitGateEvidenceView;
  realExecutorPregate: RealExecutorPregateView;
  selectedOptionId: string;
  parserViewModel: ParsedAgentHubViewModel;
  sampleImportPreview: SampleImportPreviewViewModel;
  handoffEvidence: HandoffEvidenceView;
  actionQueueMock: ActionQueueMockView;
  executorSandboxBoundary: ExecutorSandboxBoundaryView;
  noopQueueItem: ActionQueueMockItem;
  noopExecutorReceipt: NoopExecutorFixtureReceipt;
  noopScenarioResults: NoopExecutorScenarioResult[];
  semiAutoLoopReadiness: SemiAutoLoopReadiness;
}

const capabilityLayers = [
  {
    level: 'L0',
    title: '观察层 / Observe',
    status: 'open',
    summary: '展示 mock/imported status、gate、receipt、risk 和 provenance。',
  },
  {
    level: 'L1',
    title: '草案层 / Draft',
    status: 'open',
    summary: '生成 copy-only instruction、Action Envelope 与 receipt template。',
  },
  {
    level: 'L2',
    title: '验证层 / Validation evidence',
    status: 'gated',
    summary: '仅展示 metadata preflight 与 build receipt；没有 UI build 按钮。',
  },
  {
    level: 'L3',
    title: '真实动作层 / Real action',
    status: 'locked',
    summary: 'dry-run、write、executor、commit、push 全部锁定。',
  },
] as const;

export function ControlConsolePanel({
  project,
  dashboard,
  gatePilot,
  commitGateEvidence,
  realExecutorPregate,
  selectedOptionId,
  parserViewModel,
  sampleImportPreview,
  handoffEvidence,
  actionQueueMock,
  executorSandboxBoundary,
  noopQueueItem,
  noopExecutorReceipt,
  noopScenarioResults,
  semiAutoLoopReadiness,
}: ControlConsolePanelProps) {
  const readonlyMetadataPrototype = readonlyMetadataExecutorPrototypeView;
  const readonlyMetadataReceipt = readonlyMetadataExecutorExecutionReceipt;
  const readonlyMetadataStability = readonlyMetadataExecutorStabilityView;
  const selectedPathWritePrototype = selectedPathWriteExecutorPrototypeView;
  const rollbackPolicy = rollbackRecoveryPolicyView;
  const rollbackPrototype = rollbackRecoveryPrototypeView;
  const rollbackPreflight = rollbackPreflightView;
  const rollbackCloseout = rollbackRecoveryCloseoutView;
  const buildExecutor = buildExecutorView;
  const buildExecutorReceipt = buildExecutorReceiptView;
  const multiFileWrite = multiFileWriteView;
  const multiFileWriteReceiptView = multiFileWriteReceipt;
  const stagePreflight = stageExecutorPreflightView;
  const stageExecutor = stageExecutorView;
  const stageExecutorReceipt = stageExecutorReceiptView;
  const stageRecoveryReceipt = stageRecoveryReceiptView;
  const commitExecutorPreflight = commitExecutorPreflightView;
  const commitExecutorReceipt = commitExecutorReceiptView;
  const commitRecoveryPolicy = commitRecoveryPolicyView;
  const pushExecutorPreflight = pushExecutorPreflightView;
  const pushRemoteTarget = pushRemoteTargetView;
  const pushNoExecutionCloseout = pushNoExecutionCloseoutView;
  const pushExecutorContract = pushExecutorContractView;
  const pushExecutorReceipt = pushExecutorReceiptView;
  const pushRemoteVerification = pushRemoteVerificationView;
  const finalExecutionChainCloseout = finalExecutionChainCloseoutView;
  const localExecutionChainFinal = localExecutionChainFinalView;
  const productizationReadiness = productizationReadinessView;
  const finalHandoff = finalHandoffView;
  const noPushFinalization = noPushFinalizationView;
  const productOverviewDashboard = productOverviewDashboardView;
  const productDemoFlow = productDemoFlowView;
  const capabilityMaturitySummary = capabilityMaturitySummaryView;
  const executionChainRoadmap = executionChainRoadmapView;
  const evidenceSummary = evidenceSummaryView;
  const safetyBoundarySummary = safetyBoundarySummaryView;
  const productNextDecision = productNextDecisionView;
  const localV01ProductReview = localV01ProductReviewView;
  const finalReviewScorecard = finalReviewScorecardView;
  const userJourney = userJourneyView;
  const newChatHandoff = newChatHandoffView;
  const productizedPanels = [
    'ProductOverviewDashboard',
    'ProductDemoFlowPanel',
    'CapabilityMaturitySummaryPanel',
    'ExecutionChainRoadmapPanel',
    'EvidenceSummaryPanel',
    'SafetyBoundarySummaryPanel',
    'ProductNextDecisionPanel',
    'UserJourneyPanel',
    'LocalV01ProductReviewPanel',
    'FinalReviewScorecardPanel',
    'NewChatHandoffPanel',
  ] as const;
  const executionChainReadiness = commitExecutionChainReadinessView;
  const selectedPathWritePreflight = {
    mode: 'zero_write_selected_path_preflight' as const,
    summary:
      'DemoScenario045 runs selected-path write preflight only: approval packet, target path, preimage, expected diff, rollback, human review, Pro gate, and mutation_expectation=zero.',
    receipt: selectedPathWritePreflightReceipt,
    packet: selectedPathWriteApprovalPacket,
    targetMetadata: selectedPathWriteTargetMetadata,
    checks: selectedPathWritePreflightReceipt.stop_checks,
    zeroWriteEvidence: [
      'selected_path_write_executor_candidate=true',
      'write_executor_enabled=false',
      'write_execution_approved=false',
      'preflight_only=true',
      'actual_write_performed=false',
      'stage_permission=false',
      'commit_permission=false',
      'push_permission=false',
      'receipt_status=pass_zero_write',
    ],
  };
  const lockedSignals = [
    'permission_sandbox_mock=true',
    'selected_file_import_enabled=true',
    'browser_only_import=true',
    'semi_auto_action_loop=true',
    'loop_mode=mock_only',
    'semi_auto_loop=true',
    'supervised_handoff_evidence=true',
    'action_queue_mock_only=true',
    'noop_executor_fixture=true',
    'commit_gate_evidence_visible=true',
    'real_executor_pregate_visible=true',
    `readonly_metadata_executor_prototype=${String(readonlyMetadataPrototype.readonly_metadata_executor_prototype)}`,
    `prototype_implemented=${String(readonlyMetadataPrototype.prototype_implemented)}`,
    `prototype_executed=${String(readonlyMetadataPrototype.prototype_executed)}`,
    `executor_executed=${String(true)}`,
    `readonly_metadata_executor_receipt=${String(true)}`,
    `receipt_status=${readonlyMetadataReceipt.receipt_status}`,
    `receipt_qa_status=${readonlyMetadataReceipt.receipt_qa_status}`,
    `readonly_metadata_stability_panel_visible=${String(true)}`,
    `repeated_execution_rounds=${String(readonlyMetadataStability.rounds_executed)}`,
    `receipt_diff_consistency=${readonlyMetadataStability.consistency_status}`,
    `zero_mutation_status=${readonlyMetadataStability.zero_mutation_status}`,
    'write_executor_planning_gate_visible=true',
    'stop_retry_policy_visible=true',
    'hardening_scenarios_visible=true',
    `zero_mutation_assertion=${String(readonlyMetadataReceipt.zero_mutation_assertion)}`,
    `allowed_commands_count=${String(readonlyMetadataPrototype.allowedCommandsCount)}`,
    `real_executor_approved=${String(realExecutorPregate.realExecutorApproved)}`,
    `no_op_executor_only=${String(realExecutorPregate.noOpExecutorOnly)}`,
    `independent_pro_gate_required=${String(realExecutorPregate.independentProGateRequired)}`,
    `sandbox_profile_required=${String(realExecutorPregate.sandboxProfileRequired)}`,
    `receipt_rollback_recovery_required=${String(realExecutorPregate.receiptRollbackRecoveryRequired)}`,
    `selected_path_write_executor_candidate=${String(selectedPathWritePrototype.selected_path_write_executor_candidate)}`,
    `write_executor_enabled=${String(selectedPathWritePrototype.write_executor_enabled)}`,
    `write_execution_approved=${String(selectedPathWritePrototype.write_execution_approved)}`,
    `preflight_only=${String(selectedPathWritePrototype.preflight_only)}`,
    `actual_write_performed=${String(selectedPathWritePrototype.actual_write_performed)}`,
    `selected_path_write_preflight_receipt=${selectedPathWritePreflight.receipt.receipt_status}`,
    `rollback_recovery_candidate=${String(rollbackPolicy.rollback_recovery_candidate)}`,
    `rollback_execution_approved=${String(rollbackPolicy.rollback_execution_approved)}`,
    `rollback_executor_enabled=${String(rollbackPolicy.rollback_executor_enabled)}`,
    `rollback_preflight_only=${String(rollbackPolicy.rollback_preflight_only)}`,
    `actual_rollback_performed=${String(rollbackPolicy.actual_rollback_performed)}`,
    `rollback_preflight_receipt=${rollbackPreflight.receipt.receipt_status}`,
    `rollback_receipt_validator_status=${rollbackPreflight.validatorEvidence.status}`,
    `rollback_recovery_closeout=${rollbackCloseout.status}`,
    'DemoScenario052 required for first rollback execution approval',
    'Rollback preflight passed does not authorize rollback execution',
    'Rollback execution is mutation and requires separate Pro gate',
    `build_executor_v0_1=${String(buildExecutor.build_executor_v0_1)}`,
    `build_executor_implemented=${String(buildExecutor.build_executor_implemented)}`,
    `build_executor_executed=${String(buildExecutor.build_executor_executed)}`,
    `build_executor_receipt=${buildExecutorReceipt.receipt_status}`,
    `build_executor_command=${buildExecutor.allowed_command}`,
    'multi_file_selected_path_write=true',
    `multi_file_write_receipt=${multiFileWriteReceiptView.receipt_status}`,
    `multi_file_write_changed_files=${String(multiFileWriteReceiptView.changed_files.length)}`,
    `stage_executor_candidate=${String(stagePreflight.stage_executor_candidate)}`,
    `stage_executor_enabled=${String(stagePreflight.stage_executor_enabled)}`,
    `stage_execution_approved=${String(stagePreflight.stage_execution_approved)}`,
    `stage_preflight_only=${String(stagePreflight.stage_preflight_only)}`,
    `actual_stage_performed=${String(stagePreflight.actual_stage_performed)}`,
    'Stage preflight does not authorize git add',
    'DemoScenario058 required before first stage execution approval',
    `stage_executor_v0_1=${String(stageExecutor.stage_executor_v0_1)}`,
    `stage_executor_implemented=${String(stageExecutor.stage_executor_implemented)}`,
    `stage_execution_approved=${String(stageExecutor.stage_execution_approved)}`,
    `stage_executor_current_blocked=${String(stageExecutor.current_execution_blocked)}`,
    `stage_executor_receipt=${stageExecutorReceipt.receipt_status}`,
    `stage_recovery_receipt=${stageRecoveryReceipt.receipt_status}`,
    `commit_executor_v0_1=${String(true)}`,
    `commit_executor_implemented=${String(commitExecutorReceipt.commit_executor_implemented)}`,
    `commit_executor_enabled=${String(commitExecutorReceipt.commit_executor_enabled)}`,
    `commit_execution_approved=${String(commitExecutorReceipt.commit_execution_approved)}`,
    `commit_preflight_verified=${String(commitExecutorPreflight.commit_executor_candidate)}`,
    `actual_commit_performed=${String(commitExecutorReceipt.actual_commit_performed)}`,
    `commit_executor_receipt=${commitExecutorReceipt.receipt_status}`,
    `push_executor_candidate=${String(pushExecutorPreflight.push_executor_candidate)}`,
    `push_executor_enabled=${String(pushExecutorPreflight.push_executor_enabled)}`,
    `push_execution_approved=${String(pushExecutorPreflight.push_execution_approved)}`,
    `actual_push_performed=${String(pushExecutorPreflight.actual_push_performed)}`,
    `remote_configured=${String(pushExecutorPreflight.remote_configured)}`,
    `upstream_configured=${String(pushExecutorPreflight.upstream_configured)}`,
    `push_executor_v0_1=${String(pushExecutorContract.push_executor_v0_1)}`,
    `push_executor_implemented=${String(pushExecutorContract.push_executor_implemented)}`,
    `push_target_complete=${String(pushExecutorContract.push_target_complete)}`,
    `force_push_allowed=${String(pushExecutorContract.force_push_allowed)}`,
    `tags_allowed=${String(pushExecutorContract.tags_allowed)}`,
    `mirror_allowed=${String(pushExecutorContract.mirror_allowed)}`,
    `push_executor_receipt=${pushExecutorReceipt.receipt_status}`,
    `receipt_status=${pushExecutorReceipt.receipt_status}`,
    `command_executed=${String(pushExecutorReceipt.command_executed)}`,
    `credential_or_token_printed=${String(pushExecutorReceipt.credential_or_token_printed)}`,
    `remote_verification_status=${pushRemoteVerification.verification_status}`,
    `network_verification_performed=${String(pushRemoteVerification.network_verification_performed)}`,
    `final_execution_chain_closeout=${finalExecutionChainCloseout.status}`,
    `local_execution_chain_v0_1_final=${String(localExecutionChainFinal.local_execution_chain_v0_1_final)}`,
    `no_push_finalization=${String(noPushFinalization.no_push_finalization)}`,
    `push_execution_excluded=${String(localExecutionChainFinal.push_execution_excluded)}`,
    `read_only_metadata_executor=${localExecutionChainFinal.capabilityMatrix[0].status}`,
    `build_executor=${localExecutionChainFinal.capabilityMatrix[1].status}`,
    `selected_path_write=${localExecutionChainFinal.capabilityMatrix[3].status}`,
    `rollback_recovery=${localExecutionChainFinal.capabilityMatrix[4].status}`,
    `stage_executor=${localExecutionChainFinal.capabilityMatrix[5].status}`,
    `commit_executor=${localExecutionChainFinal.capabilityMatrix[6].status}`,
    `push_executor=${localExecutionChainFinal.capabilityMatrix[7].status}`,
    'Local execution chain v0.1 is finalized without push',
    'Future push requires remote target approval and fresh Pro gate',
    'Push preflight does not authorize git push',
    'No remote/upstream means push remains blocked',
    'First push requires separate user approval and Pro gate',
    `execution_chain_readiness=${executionChainReadiness.readiness_status}`,
    `executor_mode=${noopExecutorReceipt.executor_mode}`,
    `simulated_only=${String(noopExecutorReceipt.simulated_only)}`,
    `real_executor_implemented=${String(noopExecutorReceipt.real_executor_implemented)}`,
    'instruction_draft_only=true',
    'human_approval_required=true',
    'copy_to_codex_manual=true',
    'auto_send_enabled=false',
    'auto_execute_enabled=false',
    `shell_access=${String(noopExecutorReceipt.shell_access)}`,
    `npm_action=${String(noopExecutorReceipt.npm_action)}`,
    `git_action=${String(noopExecutorReceipt.git_action)}`,
    `write_action=${String(noopExecutorReceipt.write_action)}`,
    `external_action=${String(noopExecutorReceipt.external_action)}`,
    'imported_content_as_instruction=false',
    'requires_human_copy_and_approval=true',
    `browser_only_sample_import=${String(sampleImportPreview.browserOnlySampleImport)}`,
    `fixture_only_parser=${String(parserViewModel.fixtureOnlyParser)}`,
    `real_agent_hub_import=${String(parserViewModel.realAgentHubImport)}`,
    'file_upload_implemented=false',
    `file_upload_enabled=${String(sampleImportPreview.fileUploadEnabled)}`,
    `directory_picker_enabled=${String(sampleImportPreview.directoryPickerEnabled)}`,
    `fs_access=${String(parserViewModel.fsAccess)}`,
    `backend_read=${String(sampleImportPreview.backendRead)}`,
    'backend_import=false',
    `local_path_read=${String(sampleImportPreview.localPathRead)}`,
    'write_permission=false',
    `stage_permission=${String(readonlyMetadataPrototype.stagePermission)}`,
    `commit_permission=${String(readonlyMetadataPrototype.commitPermission)}`,
    'git_action_permission=false',
    'npm_action_permission=false',
    'executor_permission=false',
    'git_permission=false',
    'npm_permission=false',
    'wiki_permission=false',
    'push_permission=false',
    `real_dry_run_approved=${String(gatePilot.real_dry_run_approved)}`,
    'build_execution_available=false',
    `build_execution_approved=${String(gatePilot.build_execution_approved)}`,
    `selected_path_write_approved=${String(gatePilot.selected_path_write_approved)}`,
    `executor_implemented=${String(gatePilot.executor_implemented)}`,
    `receipt_status=${noopExecutorReceipt.receipt_status}`,
    `verification_status=${noopExecutorReceipt.verification_status}`,
    `scenario_matrix_count=${String(noopScenarioResults.length)}`,
    `semi_auto_loop_readiness=${String(semiAutoLoopReadiness.canEnterNoopExecutorControlledLoopMock)}`,
    `executor_sandbox_mode=${executorSandboxBoundary.sandboxMode}`,
    `read_only=${String(project.importStatus.readOnly)}`,
    `execution_connected=${String(project.importStatus.executionConnected)}`,
    'commit_button=false',
    'push_button=false',
  ];

  return (
    <section className="action-control-panel" aria-labelledby="control-console-title">
      <div className="action-control-header">
        <div>
          <p className="eyebrow">DemoScenario011 / UI polish final review</p>
          <h2 id="control-console-title">AgentHub Visual Manager v0.1 Product Console</h2>
          <p>
            DemoScenario011 polishes the local v0.1 product dashboard, demo flow, denoised roadmap, scorecard, next decision, and copyable handoff package.
          </p>
          <p>
            集中展示 Gate Overview、Parser Result、Sample Import Preview、Permission Sandbox、Receipt Timeline、Next Decision 和 L0-L3 能力层级。
            DemoScenario043 追加 stop-retry policy、receipt QA policy、blocked/failed/retry-not-allowed scenarios；
            exact_paths、review_status、pro_closeout、staged_check、read-only metadata receipt 和 executor sandbox boundary 可见；
            upload、directory picker、filesystem、backend、real executor、write、commit、push 均保持 locked。
          </p>
        </div>
        <div className="action-lock-stack" aria-label="Control Console locked signals">
          {lockedSignals.map((signal) => (
            <span key={signal}>{signal}</span>
          ))}
        </div>
      </div>

      <div className="dry-run-summary-grid" aria-label="L0 to L3 capability layers">
        {capabilityLayers.map((layer) => (
          <div key={layer.level}>
            <span>{layer.level} / {layer.status}</span>
            <strong>{layer.title}</strong>
            <small>{layer.summary}</small>
          </div>
        ))}
      </div>

      <div className="action-control-grid" aria-label="Control Console key status">
        <section className="action-panel-block action-selected-decision">
          <span className="action-panel-label">当前目标 / Current Goal</span>
          <h3>{project.project.currentGoal}</h3>
          <p>{dashboard.activeTrial}</p>
          <dl className="action-field-list">
            <ConsoleField label="phase" value={project.project.currentPhase} />
            <ConsoleField label="stable baseline" value={project.project.stableBaseline} />
            <ConsoleField label="build status" value={project.project.buildStatus} />
          </dl>
        </section>

        <section className="action-panel-block action-envelope-summary">
          <span className="action-panel-label">仓库状态 / Repo</span>
          <h3>{project.project.repoStatus}</h3>
          <p>{dashboard.repoStatus}</p>
          <dl className="action-field-list">
            <ConsoleField label="commit gate" value={project.project.commitGate} />
            <ConsoleField label="staged policy" value={dashboard.stagedStatus} />
            <ConsoleField label="push policy" value={dashboard.pushStatus} />
          </dl>
        </section>

        <section className="action-panel-block action-gate-summary">
          <span className="action-panel-label">Real Action Lock</span>
          <h3>全部真实动作锁定</h3>
          <p>No-op executor fixture is simulated-only. 无 shell/npm/Git/write button、无 build button、无 commit/push button。</p>
          <dl className="action-field-list">
            <ConsoleField label="data mode" value={dashboard.dataMode} />
            <ConsoleField label="read scope" value={dashboard.readScope} />
            <ConsoleField label="action policy" value={dashboard.actionPolicy} />
          </dl>
        </section>
      </div>

      <ProductOverviewDashboard dashboard={productOverviewDashboard} />
      <PanelIndexCard panels={productizedPanels} />
      <ProductDemoFlowPanel flow={productDemoFlow} />
      <CapabilityMaturitySummaryPanel maturity={capabilityMaturitySummary} />
      <ExecutionChainRoadmapPanel roadmap={executionChainRoadmap} />
      <EvidenceSummaryPanel evidence={evidenceSummary} />
      <SafetyBoundarySummaryPanel safety={safetyBoundarySummary} />
      <ProductNextDecisionPanel decision={productNextDecision} />
      <UserJourneyPanel journey={userJourney} />
      <LocalV01ProductReviewPanel review={localV01ProductReview} />
      <FinalReviewScorecardPanel scorecard={finalReviewScorecard} />
      <NewChatHandoffPanel handoff={newChatHandoff} />

      <details className="action-panel-block action-envelope-summary" aria-label="DetailedEvidenceArchive">
        <summary>Detailed evidence archive</summary>
      <GateOverviewPanel gatePilot={gatePilot} />
      <ParserPrototypePanel viewModel={parserViewModel} />
      <SampleImportPreviewPanel preview={sampleImportPreview} />
      <SelectedFileImportPanel />
      <PermissionSandboxPanel />
      <SemiAutoActionLoopPanel
        project={project}
        selectedOptionId={selectedOptionId}
        queueItem={noopQueueItem}
        receipt={noopExecutorReceipt}
        readiness={semiAutoLoopReadiness}
      />
      <LoopReadinessPanel readiness={semiAutoLoopReadiness} receipt={noopExecutorReceipt} />
      <CommitGateEvidencePanel evidence={commitGateEvidence} />
      <RealExecutorPregatePanel pregate={realExecutorPregate} />
      <SelectedPathWriteExecutorPrototypePanel prototype={selectedPathWritePrototype} />
      <SelectedPathWritePreflightPanel preflight={selectedPathWritePreflight} />
      <WriteExecutorBoundaryPanel boundary={selectedPathWriteBoundaryView} />
      <RollbackRecoveryPolicyPanel policy={rollbackPolicy} />
      <RollbackRecoveryPrototypePanel prototype={rollbackPrototype} />
      <RollbackPreflightReceiptPanel preflight={rollbackPreflight} />
      <RollbackRecoveryCloseoutPanel closeout={rollbackCloseout} />
      <BuildExecutorPanel buildExecutor={buildExecutor} />
      <BuildExecutorReceiptPanel receipt={buildExecutorReceipt} />
      <MultiFileWriteExecutorPanel multiFileWrite={multiFileWrite} />
      <MultiFileWriteReceiptPanel receipt={multiFileWriteReceiptView} />
      <StageExecutorPreflightPanel preflight={stagePreflight} />
      <StageExecutorReceiptPanel executor={stageExecutor} receipt={stageExecutorReceipt} />
      <StageRecoveryReceiptPanel receipt={stageRecoveryReceipt} />
      <CommitExecutorReceiptPanel receipt={commitExecutorReceipt} />
      <CommitRecoveryPolicyPanel policy={commitRecoveryPolicy} />
      <PushRemoteTargetPanel target={pushRemoteTarget} />
      <PushExecutorPreflightPanel preflight={pushExecutorPreflight} />
      <PushNoExecutionCloseoutPanel closeout={pushNoExecutionCloseout} />
      <PushExecutorReceiptPanel contract={pushExecutorContract} receipt={pushExecutorReceipt} />
      <PushRemoteVerificationPanel verification={pushRemoteVerification} />
      <FinalExecutionChainCloseoutPanel closeout={finalExecutionChainCloseout} />
      <NoPushFinalizationPanel finalization={noPushFinalization} />
      <LocalExecutionChainFinalPanel finalChain={localExecutionChainFinal} />
      <ProductizationReadinessPanel readiness={productizationReadiness} />
      <FinalHandoffPanel handoff={finalHandoff} />
      <ExecutionChainReadinessPanel readiness={executionChainReadiness} />
      <ReadonlyMetadataExecutorPrototypePanel
        prototype={readonlyMetadataPrototype}
        executionStatusNote="DemoScenario044 repeated-execution receipt evidence is shown below; this card preserves the original prototype contract snapshot."
      />
      <ReadonlyMetadataExecutorReceiptPanel receipt={readonlyMetadataReceipt} />
      <ReadonlyMetadataExecutorStabilityPanel stability={readonlyMetadataStability} />
      <SemiAutoHandoffPanel project={project} selectedOptionId={selectedOptionId} gatePilot={gatePilot} />
      <HumanApprovalWorkflowPanel project={project} selectedOptionId={selectedOptionId} />
      <HandoffEvidencePanel evidence={handoffEvidence} />
      <ActionQueueMockPanel queue={actionQueueMock} />
      <NoopExecutorReceiptPanel
        queueItem={noopQueueItem}
        receipt={noopExecutorReceipt}
        scenarioResults={noopScenarioResults}
        readiness={semiAutoLoopReadiness}
      />
      <ExecutorSandboxBoundaryPanel boundary={executorSandboxBoundary} />

      <div className="receipt-audit-grid">
        <ReceiptTimelinePanel
          gatePilot={gatePilot}
          parserViewModel={parserViewModel}
          sampleImportPreview={sampleImportPreview}
          noopExecutorReceipt={noopExecutorReceipt}
          noopScenarioResults={noopScenarioResults}
        />
        <NextDecisionPanel
          project={project}
          selectedOptionId={selectedOptionId}
          nextDecisionPacket={gatePilot.nextDecisionPacket}
          parserViewModel={parserViewModel}
          sampleImportPreview={sampleImportPreview}
          noopExecutorReceipt={noopExecutorReceipt}
          noopScenarioResults={noopScenarioResults}
          readiness={semiAutoLoopReadiness}
        />
      </div>
      </details>
    </section>
  );
}

function ConsoleField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
