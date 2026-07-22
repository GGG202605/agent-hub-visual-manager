import { useMemo, useState } from 'react';
import type { ActionEnvelopeDraft, ActionGatePilot } from '../types';
import { createDryRunMockPlan, formatDryRunMockPlan } from '../lib/agentHubDryRunMock';

interface DryRunMockPanelProps {
  envelope: ActionEnvelopeDraft;
  gatePilot: ActionGatePilot;
}

export function DryRunMockPanel({ envelope, gatePilot }: DryRunMockPanelProps) {
  const [copyState, setCopyState] = useState('模拟草案可复制 / mock plan ready');
  const plan = useMemo(() => createDryRunMockPlan(envelope), [envelope]);
  const planText = useMemo(() => formatDryRunMockPlan(plan), [plan]);

  async function copyPlan() {
    if (!navigator.clipboard) {
      setCopyState('浏览器未开放 clipboard；请手动复制 dry-run mock plan。');
      return;
    }

    try {
      await navigator.clipboard.writeText(planText);
      setCopyState('已复制 dry-run mock plan / plan copied');
    } catch {
      setCopyState('复制失败；未执行任何动作，请手动复制。');
    }
  }

  return (
    <section className="dry-run-mock-panel" aria-labelledby="dry-run-mock-title">
      <div className="action-control-header">
        <div>
          <p className="eyebrow">ACTION3-ARCH / Dry-run 模拟草案 / fixture-only</p>
          <h2 id="dry-run-mock-title">Dry-run Simulator Architecture Mock</h2>
          <p>
            仅基于 Action Envelope 草案生成模拟预检草案；不读取文件系统，不运行命令，不写入，不执行 Codex/Git/npm/Wiki。
          </p>
        </div>
        <div className="action-lock-stack" aria-label="dry run mock safety state">
          <span>simulator_mode: {plan.simulator_mode}</span>
          <span>real_dry_run_approved: {String(plan.real_dry_run_approved)}</span>
          <span>executor_connected: {String(plan.executor_connected)}</span>
          <span>filesystem_access: {String(plan.filesystem_access)}</span>
          <span>shell_access: {String(plan.shell_access)}</span>
          <span>write_access: {String(plan.write_access)}</span>
          <span>build_execution_approved: {String(gatePilot.build_execution_approved)}</span>
          <span>selected_path_write_approved: {String(gatePilot.selected_path_write_approved)}</span>
          <span>executor_implemented: {String(gatePilot.executor_implemented)}</span>
        </div>
      </div>

      <div className="dry-run-summary-grid">
        <DryRunMetric label="action_id" value={plan.action_id} />
        <DryRunMetric label="source envelope" value={plan.source_envelope} />
        <DryRunMetric label="realDryRunImplemented" value={String(plan.realDryRunImplemented)} />
        <DryRunMetric label="metadata receipt" value={gatePilot.metadataPreflightReceipt.receipt_status} />
        <DryRunMetric label="control HEAD" value={gatePilot.metadataPreflightReceipt.control_project.head.slice(0, 7)} />
        <DryRunMetric label="second HEAD" value={gatePilot.metadataPreflightReceipt.second_project.head.slice(0, 7)} />
      </div>

      <div className="dry-run-detail-grid">
        <DryRunList title="Metadata Gate / 元数据预检" items={metadataReceiptItems(gatePilot)} />
        <DryRunList title="计划检查 / Planned checks" items={plan.planned_checks} />
        <DryRunList title="阻断真实动作 / Blocked real actions" items={plan.blocked_real_actions} />
        <DryRunList
          title="未来批准后证据 / Expected evidence"
          items={plan.expected_evidence_if_future_dry_run_is_approved}
        />
        <DryRunList title="停止条件 / Stop conditions" items={plan.stop_conditions} />
        <DryRunList title="下一步审批 / Next approval required" items={plan.next_approval_required} />
      </div>

      <section className="action-copy-block dry-run-copy-block">
        <div className="action-copy-header">
          <div>
            <span className="action-panel-label">仅复制草案 / Copy-only</span>
            <h3>Dry-run mock plan</h3>
          </div>
          <button type="button" className="action-copy-button" onClick={() => void copyPlan()}>
            仅复制模拟草案 / Copy dry-run mock plan
          </button>
        </div>
        <textarea readOnly value={planText} aria-label="copy-only dry-run mock plan" />
      </section>

      <div className="action-policy-footer">
        <strong>{copyState}</strong>
        <span>未批准真实 dry-run</span>
        <span>real_dry_run_approved={String(gatePilot.real_dry_run_approved)}</span>
        <span>build_execution_approved={String(gatePilot.build_execution_approved)}</span>
        <span>selected_path_write_approved={String(gatePilot.selected_path_write_approved)}</span>
        <span>不读取文件系统 / 不运行命令 / 不写入</span>
      </div>
    </section>
  );
}

function DryRunMetric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function DryRunList({ title, items }: { title: string; items: string[] }) {
  return (
    <section className="dry-run-list-card">
      <h3>{title}</h3>
      <ul>
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </section>
  );
}

function metadataReceiptItems(gatePilot: ActionGatePilot) {
  const receipt = gatePilot.metadataPreflightReceipt;

  return [
    `operation_id: ${receipt.operation_id}`,
    `approval_scope: ${receipt.approval_scope}`,
    `receipt_status: ${receipt.receipt_status}`,
    `control: ${receipt.control_project.branch} / ${receipt.control_project.head.slice(0, 7)} / ${receipt.control_project.status} / staged ${receipt.control_project.staged}`,
    `second: ${receipt.second_project.branch} / ${receipt.second_project.head.slice(0, 7)} / ${receipt.second_project.status} / staged ${receipt.second_project.staged}`,
    receipt.unchanged_assertion,
  ];
}
