import { useMemo, useState } from 'react';
import type { ActionEnvelopeDraft, ActionGatePilot, OperationReceiptTemplate, ReceiptReviewItem } from '../types';
import { createReceiptReviewView, formatReceiptReviewView } from '../lib/agentHubReceiptReview';

interface ReceiptReviewPanelProps {
  envelope: ActionEnvelopeDraft;
  receipt: OperationReceiptTemplate;
  gatePilot: ActionGatePilot;
}

export function ReceiptReviewPanel({ envelope, receipt, gatePilot }: ReceiptReviewPanelProps) {
  const [copyState, setCopyState] = useState('审计清单可复制 / checklist ready');
  const review = useMemo(() => createReceiptReviewView(receipt), [receipt]);
  const reviewText = useMemo(() => formatReceiptReviewView(review), [review]);
  const statusItems = [
    review.approval_status,
    review.executor_status,
    review.command_summary_status,
    review.files_changed_status,
    review.diff_summary_status,
    review.build_test_status,
    review.final_git_status,
    review.commit_hash_status,
    review.push_status,
    review.evidence_refs_status,
  ];

  async function copyChecklist() {
    if (!navigator.clipboard) {
      setCopyState('浏览器未开放 clipboard；请手动复制清单。');
      return;
    }

    try {
      await navigator.clipboard.writeText(reviewText);
      setCopyState('已复制审计清单 / audit checklist copied');
    } catch {
      setCopyState('复制失败；未执行任何动作，请手动复制。');
    }
  }

  return (
    <section className="receipt-review-panel" aria-labelledby="receipt-review-title">
      <div className="action-control-header">
        <div>
          <p className="eyebrow">RECEIPT2 / 回执审计 / not executed</p>
          <h2 id="receipt-review-title">回执审计面板 / Operation Receipt Review</h2>
          <p>
            这是回执模板，不是真实执行回执。所有执行相关字段保持 pending / not executed / unavailable。
          </p>
        </div>
        <div className="action-lock-stack" aria-label="receipt review state">
          <span>receipt_status: {review.receipt_status}</span>
          <span>action_id: {review.action_id}</span>
          <span>source envelope: {envelope.envelope_hash_preview}</span>
          <span>metadata_receipt: {gatePilot.metadataPreflightReceipt.receipt_status}</span>
          <span>real_dry_run_approved=false</span>
          <span>selected_path_write_approved=false</span>
          <span>执行未发生 / not executed</span>
        </div>
      </div>

      <div className="receipt-review-grid">
        {statusItems.map((item) => (
          <ReceiptStatusCard key={item.label} item={item} />
        ))}
      </div>

      <div className="receipt-audit-grid">
        {gatePilot.receiptEvidence.map((item) => (
          <section key={item.kind} className="receipt-audit-card">
            <span className="action-panel-label">{item.label}</span>
            <h3>{item.status}</h3>
            <p>{item.evidence}</p>
          </section>
        ))}
        <section className="receipt-audit-card">
          <span className="action-panel-label">缺失证据 / Missing evidence</span>
          <ul>
            {review.missing_evidence_checklist.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>
        <section className="receipt-audit-card receipt-blocked-card">
          <span className="action-panel-label">阻断原因 / Blocked reason</span>
          <p>{review.blocked_reason}</p>
        </section>
      </div>

      <div className="receipt-timeline" aria-label="receipt timeline">
        {review.receipt_timeline.map((item, index) => (
          <article key={item.step} className={`receipt-timeline-step receipt-${item.status}`}>
            <span>{String(index + 1).padStart(2, '0')}</span>
            <strong>{item.step}</strong>
            <small>{item.note}</small>
          </article>
        ))}
      </div>

      <div className="action-policy-footer">
        <button type="button" className="action-copy-button" onClick={() => void copyChecklist()}>
          仅复制审计清单 / Copy audit checklist
        </button>
        <strong>{copyState}</strong>
        <span>不会伪造真实执行结果</span>
        <span>fixture receipt != metadata preflight receipt</span>
        <span>metadata operation: {gatePilot.metadataPreflightReceipt.operation_id}</span>
        <span>不调用 executor / Git / npm / Wiki / shell</span>
      </div>
    </section>
  );
}

function ReceiptStatusCard({ item }: { item: ReceiptReviewItem }) {
  return (
    <article className={`receipt-status-card receipt-status-${item.status}`}>
      <span>{item.label}</span>
      <strong>{item.value}</strong>
      <small>{item.note}</small>
    </article>
  );
}
