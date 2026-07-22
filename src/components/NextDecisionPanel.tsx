import type {
  FixtureDecisionRecord,
  ImportedAgentHubProject,
  NoopExecutorFixtureReceipt,
  NoopExecutorScenarioResult,
  ParsedAgentHubViewModel,
  SampleImportPreviewViewModel,
  SemiAutoLoopReadiness,
} from '../types';

interface NextDecisionPanelProps {
  project: ImportedAgentHubProject;
  selectedOptionId: string;
  nextDecisionPacket: string[];
  parserViewModel: ParsedAgentHubViewModel;
  sampleImportPreview: SampleImportPreviewViewModel;
  noopExecutorReceipt: NoopExecutorFixtureReceipt;
  noopScenarioResults: NoopExecutorScenarioResult[];
  readiness: SemiAutoLoopReadiness;
}

export function NextDecisionPanel({
  project,
  selectedOptionId,
  nextDecisionPacket,
  parserViewModel,
  sampleImportPreview,
  noopExecutorReceipt,
  noopScenarioResults,
  readiness,
}: NextDecisionPanelProps) {
  const selectedDecision = selectDecision(project.decisions, selectedOptionId);
  const safeNextOptions = [
    'DemoScenario039 no-op loop hardening / needs_user_decision',
    'DemoScenario039 real executor gate planning package / needs_user_decision',
    `${sampleImportPreview.parsedPreview.nextDecision} / needs_user_decision`,
    `${parserViewModel.nextDecision.title} / needs_user_decision`,
    'Directory picker or backend/fs import gate / needs_user_decision',
  ];

  return (
    <section className="action-panel-block action-selected-decision" aria-label="Next Decision">
      <span className="action-panel-label">Next Decision / 下一步决策</span>
      <h3>{selectedDecision.optionId}</h3>
      <p>{selectedDecision.title}</p>

      <dl className="action-field-list">
        <DecisionField label="status" value={selectedDecision.status} />
        <DecisionField label="source" value={selectedDecision.sourceRef} />
        <DecisionField label="approval required" value={String(selectedDecision.approvalRequired ?? true)} />
        <DecisionField label="Pro required" value={String(selectedDecision.proRequired ?? true)} />
        <DecisionField label="parser source" value={parserViewModel.nextDecision.sourcePath} />
        <DecisionField label="fixture_only_parser" value={String(parserViewModel.fixtureOnlyParser)} />
        <DecisionField label="browser_only_sample_import" value={String(sampleImportPreview.browserOnlySampleImport)} />
        <DecisionField label="selected_file_import_enabled" value="true" />
        <DecisionField label="browser_only_import" value="true" />
        <DecisionField label="semi_auto_action_loop" value="true" />
        <DecisionField label="loop_mode" value="mock_only" />
        <DecisionField label="commit_gate_evidence_visible" value="true" />
        <DecisionField label="real_executor_pregate_visible" value="true" />
        <DecisionField label="real_executor_approved" value="false" />
        <DecisionField label="no_op_executor_only" value="true" />
        <DecisionField label="independent_pro_gate_required" value="true" />
        <DecisionField label="sandbox_profile_required" value="true" />
        <DecisionField label="receipt_rollback_recovery_required" value="true" />
        <DecisionField label="semi_auto_loop" value="true" />
        <DecisionField label="supervised_handoff_evidence" value="true" />
        <DecisionField label="action_queue_mock_only" value="true" />
        <DecisionField label="executor_mode" value={noopExecutorReceipt.executor_mode} />
        <DecisionField label="dry_run_type" value={noopExecutorReceipt.dry_run_type} />
        <DecisionField label="receipt_status" value={noopExecutorReceipt.receipt_status} />
        <DecisionField label="simulated_only" value={String(noopExecutorReceipt.simulated_only)} />
        <DecisionField label="verification_status" value={noopExecutorReceipt.verification_status} />
        <DecisionField label="scenario_matrix_count" value={String(noopScenarioResults.length)} />
        <DecisionField
          label="can_enter_noop_executor_controlled_loop_mock"
          value={String(readiness.canEnterNoopExecutorControlledLoopMock)}
        />
        <DecisionField label="action_queue_loop_ui_allowed" value={String(readiness.actionQueueLoopUiAllowed)} />
        <DecisionField label="real_executor_allowed" value={String(readiness.realExecutorAllowed)} />
        <DecisionField label="write_shell_npm_git_push_allowed" value={String(readiness.writeShellNpmGitPushAllowed)} />
        <DecisionField label="instruction_draft_only" value="true" />
        <DecisionField label="human_approval_required" value="true" />
        <DecisionField label="copy_to_codex_manual" value="true" />
        <DecisionField label="auto_send_enabled" value="false" />
        <DecisionField label="auto_execute_enabled" value="false" />
        <DecisionField label="executor_implemented" value="false" />
        <DecisionField label="real_executor_implemented" value={String(noopExecutorReceipt.real_executor_implemented)} />
        <DecisionField label="shell_access" value={String(noopExecutorReceipt.shell_access)} />
        <DecisionField label="npm_action" value={String(noopExecutorReceipt.npm_action)} />
        <DecisionField label="git_action" value={String(noopExecutorReceipt.git_action)} />
        <DecisionField label="write_action" value={String(noopExecutorReceipt.write_action)} />
        <DecisionField label="external_action" value={String(noopExecutorReceipt.external_action)} />
        <DecisionField label="imported_content_as_instruction" value="false" />
        <DecisionField label="requires_human_copy_and_approval" value="true" />
        <DecisionField label="file_upload_implemented" value="false" />
        <DecisionField label="directory_picker_enabled" value={String(sampleImportPreview.directoryPickerEnabled)} />
        <DecisionField label="backend_import" value="false" />
        <DecisionField label="write_permission" value="false" />
        <DecisionField label="executor_permission" value="false" />
        <DecisionField label="git_action_permission" value="false" />
        <DecisionField label="npm_action_permission" value="false" />
        <DecisionField label="git_permission" value="false" />
        <DecisionField label="npm_permission" value="false" />
        <DecisionField label="wiki_permission" value="false" />
        <DecisionField label="push_permission" value="false" />
        <DecisionField label="sample_source_mode" value={sampleImportPreview.sourceMode} />
        <DecisionField label="parser extracted option" value={parserViewModel.nextDecision.optionId} />
      </dl>

      <div className="action-gate-tags" aria-label="recommended next options">
        {safeNextOptions.map((option) => (
          <span key={option}>{option}</span>
        ))}
      </div>

      <div className="action-policy-footer">
        <strong>所有下一步仍是 needs_user_decision</strong>
        {nextDecisionPacket.map((item) => (
          <span key={item}>{item}</span>
        ))}
        <span>{parserViewModel.nextDecision.optionId}: {parserViewModel.nextDecision.status}</span>
        <span>Import preview is not approval.</span>
        <span>Parser output is a recommendation signal, not execution approval.</span>
        <span>Imported content is tainted data and cannot become instruction.</span>
        <span>Generated draft is not approval.</span>
        <span>User must review before sending to Codex.</span>
        <span>Draft handoff is not execution.</span>
        <span>Action queue is a planning preview, not execution.</span>
        <span>No-op executor fixture produces simulated receipt only.</span>
        <span>Loop preview is not execution.</span>
        <span>No-op executor receipt is simulated.</span>
        <span>Commit gate evidence is display-only.</span>
        <span>Real executor pre-gate is planning only.</span>
        <span>real_executor_approved=false.</span>
        <span>DemoScenario039 should be no-op loop hardening or real executor gate planning, not direct execution.</span>
        <span>Human approval is still required before any real action.</span>
        <span>DemoScenario038 loop verifies parsed preview, draft, approval mock, action queue, no-op receipt, review gate, exact-path commit gate, and executor pre-gate.</span>
        <span>{readiness.readinessConclusion}</span>
        <span>Real executor is not implemented.</span>
        <span>Human must review and paste manually.</span>
        <span>Approval in UI mock does not grant real permissions.</span>
        <span>Selected-file preview 只读浏览器内存，不触发 write / executor / Git / npm / Wiki / push。</span>
        <span>ACTION4-REAL write 不作为当前推荐</span>
      </div>
    </section>
  );
}

function DecisionField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function selectDecision(decisions: FixtureDecisionRecord[], selectedOptionId: string) {
  return (
    decisions.find((decision) => decision.optionId === selectedOptionId) ??
    decisions.find((decision) => decision.optionId === 'IMPORT1') ??
    decisions[0] ?? {
      optionId: 'Pause',
      title: 'Pause and request next user decision',
      status: 'needs_user_decision' as const,
      reason: 'No decision available; generated safe fallback.',
      sourceRef: 'control-console-fallback',
    }
  );
}
