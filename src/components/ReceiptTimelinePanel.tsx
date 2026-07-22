import type {
  ActionGatePilot,
  NoopExecutorFixtureReceipt,
  NoopExecutorScenarioResult,
  ParsedAgentHubViewModel,
  SampleImportPreviewViewModel,
} from '../types';

interface ReceiptTimelinePanelProps {
  gatePilot: ActionGatePilot;
  parserViewModel: ParsedAgentHubViewModel;
  sampleImportPreview: SampleImportPreviewViewModel;
  noopExecutorReceipt: NoopExecutorFixtureReceipt;
  noopScenarioResults: NoopExecutorScenarioResult[];
}

const receiptTimeline = [
  {
    step: 'DemoScenario022 metadata preflight',
    status: 'template_ready',
    note: '已记录 metadata-only receipt；仅 Git metadata，无文件写入。',
  },
  {
    step: 'DemoScenario023 build gate',
    status: 'template_ready',
    note: '已定义 build approval packet、receipt schema、artifact policy 与 stop conditions。',
  },
  {
    step: 'DemoScenario024 npm build validation',
    status: 'template_ready',
    note: 'npm run build exit 0；tsc 与 Vite build 均已进入并通过。',
  },
  {
    step: 'DemoScenario025 fixture parser prototype',
    status: 'blocked',
    note: 'Parser result、warnings、blocked scenarios 与 next decision 已展示；真实 import/fs/executor/write 继续 locked。',
  },
  {
    step: 'DemoScenario027 sample import preview',
    status: 'template_ready',
    note: 'Bundled synthetic sample -> parser -> parsed preview；import preview 不等于 approval。',
  },
  {
    step: 'DemoScenario029 selected-file import pilot',
    status: 'template_ready',
    note: 'Browser-only file input -> untrusted data -> parsed preview；无 upload、directory picker、fs/backend、write 或 executor。',
  },
  {
    step: 'DemoScenario030 import safety hardening',
    status: 'template_ready',
    note: 'Warning policy、blocked reason、taint 和 instruction boundary 可见；instruction generator 仍未实现。',
  },
  {
    step: 'DemoScenario031 draft-only instruction generator',
    status: 'template_ready',
    note: 'Selected-file parsed preview -> copyable short Codex draft；auto-send、executor、write、Git、npm、Wiki、push 均未连接。',
  },
  {
    step: 'DemoScenario032 semi-auto handoff workflow',
    status: 'template_ready',
    note: 'Parsed preview -> permission sandbox -> draft -> human review -> manual copy -> receipt return -> reviews -> exact-path gate；全程 UI mock。',
  },
  {
    step: 'DemoScenario033 supervised handoff evidence',
    status: 'template_ready',
    note: 'Handoff evidence、locked action queue 和 executor sandbox boundary 可见；action queue 是 planning preview，不执行 action。',
  },
  {
    step: 'DemoScenario035 no-op executor fixture',
    status: 'template_ready',
    note: 'Mock action queue -> noop_fixture -> simulated receipt；不 shell/npm/Git/write，不生成真实执行回执。',
  },
  {
    step: 'DemoScenario037 semi-auto action loop',
    status: 'template_ready',
    note: '8-stage loop connects parsed preview、draft、approval mock、queue、noop receipt、review gate 与 exact-path commit gate；不自动执行真实 action。',
  },
  {
    step: 'DemoScenario038 loop QA + commit gate + pregate',
    status: 'template_ready',
    note: 'commit_gate_evidence_visible=true；real_executor_pregate_visible=true；real_executor_approved=false。',
  },
] as const;

export function ReceiptTimelinePanel({
  gatePilot,
  parserViewModel,
  sampleImportPreview,
  noopExecutorReceipt,
  noopScenarioResults,
}: ReceiptTimelinePanelProps) {
  const blockedScenarioCount = noopScenarioResults.filter((result) => result.receipt.scenario_status === 'blocked').length;
  const failedScenarioCount = noopScenarioResults.filter((result) => result.receipt.scenario_status === 'failed').length;
  const unverifiableScenarioCount = noopScenarioResults.filter(
    (result) => result.receipt.scenario_status === 'unverifiable',
  ).length;

  return (
    <section className="receipt-audit-card" aria-label="Receipt Timeline">
      <span className="action-panel-label">Receipt Timeline / 回执时间线</span>
      <h3>从预检到 selected-file preview 的证据链</h3>
      <p>此处只展示已记录证据，不生成真实回执，不执行任何 action。</p>

      <div className="receipt-timeline">
        {receiptTimeline.map((item, index) => (
          <article key={item.step} className={`receipt-timeline-step receipt-${item.status}`}>
            <span>{String(index + 1).padStart(2, '0')}</span>
            <strong>{item.step}</strong>
            <small>{item.note}</small>
          </article>
        ))}
      </div>

      <dl className="action-field-list">
        <TimelineField label="metadata_receipt" value={gatePilot.metadataPreflightReceipt.receipt_status} />
        <TimelineField label="parser_fixture_receipt" value={`${parserViewModel.fixtureId} / ${parserViewModel.state}`} />
        <TimelineField
          label="sample_import_preview"
          value={`${sampleImportPreview.parsedPreview.bundleId} / ${sampleImportPreview.state}`}
        />
        <TimelineField label="browser_only_sample_import" value={String(sampleImportPreview.browserOnlySampleImport)} />
        <TimelineField label="selected_file_import_enabled" value="true" />
        <TimelineField label="browser_only_import" value="true" />
        <TimelineField label="semi_auto_action_loop" value="true" />
        <TimelineField label="loop_mode" value="mock_only" />
        <TimelineField label="commit_gate_evidence_visible" value="true" />
        <TimelineField label="real_executor_pregate_visible" value="true" />
        <TimelineField label="real_executor_approved" value="false" />
        <TimelineField label="no_op_executor_only" value="true" />
        <TimelineField label="independent_pro_gate_required" value="true" />
        <TimelineField label="sandbox_profile_required" value="true" />
        <TimelineField label="receipt_rollback_recovery_required" value="true" />
        <TimelineField label="semi_auto_loop" value="true" />
        <TimelineField label="supervised_handoff_evidence" value="true" />
        <TimelineField label="action_queue_mock_only" value="true" />
        <TimelineField label="executor_mode" value={noopExecutorReceipt.executor_mode} />
        <TimelineField label="dry_run_type" value={noopExecutorReceipt.dry_run_type} />
        <TimelineField label="receipt_status" value={noopExecutorReceipt.receipt_status} />
        <TimelineField label="simulated_only" value={String(noopExecutorReceipt.simulated_only)} />
        <TimelineField label="verification_status" value={noopExecutorReceipt.verification_status} />
        <TimelineField label="scenario_matrix_count" value={String(noopScenarioResults.length)} />
        <TimelineField label="scenario_blocked_count" value={String(blockedScenarioCount)} />
        <TimelineField label="scenario_failed_count" value={String(failedScenarioCount)} />
        <TimelineField label="scenario_unverifiable_count" value={String(unverifiableScenarioCount)} />
        <TimelineField label="instruction_draft_only" value="true" />
        <TimelineField label="human_approval_required" value="true" />
        <TimelineField label="copy_to_codex_manual" value="true" />
        <TimelineField label="auto_send_enabled" value="false" />
        <TimelineField label="auto_execute_enabled" value="false" />
        <TimelineField label="executor_implemented" value="false" />
        <TimelineField label="real_executor_implemented" value={String(noopExecutorReceipt.real_executor_implemented)} />
        <TimelineField label="shell_access" value={String(noopExecutorReceipt.shell_access)} />
        <TimelineField label="npm_action" value={String(noopExecutorReceipt.npm_action)} />
        <TimelineField label="git_action" value={String(noopExecutorReceipt.git_action)} />
        <TimelineField label="write_action" value={String(noopExecutorReceipt.write_action)} />
        <TimelineField label="external_action" value={String(noopExecutorReceipt.external_action)} />
        <TimelineField label="file_upload_enabled" value={String(sampleImportPreview.fileUploadEnabled)} />
        <TimelineField label="directory_picker_enabled" value={String(sampleImportPreview.directoryPickerEnabled)} />
        <TimelineField label="backend_import" value="false" />
        <TimelineField label="write_permission" value="false" />
        <TimelineField label="executor_permission" value="false" />
        <TimelineField label="git_action_permission" value="false" />
        <TimelineField label="npm_action_permission" value="false" />
        <TimelineField label="push_permission" value="false" />
        <TimelineField label="parser_warnings" value={String(parserViewModel.warnings.length)} />
        <TimelineField label="parser_blocked" value={String(parserViewModel.blockedScenarios.length)} />
        <TimelineField label="DemoScenario024 build receipt" value="executed_build_validation / build_passed" />
        <TimelineField label="artifact_status" value="dist present before/after; build dir absent; final Git clean" />
        <TimelineField label="package_lock_status" value="unchanged" />
      </dl>
    </section>
  );
}

function TimelineField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
