import type { ActionQueueMockView } from '../types';

interface ActionQueueMockPanelProps {
  queue: ActionQueueMockView;
}

export function ActionQueueMockPanel({ queue }: ActionQueueMockPanelProps) {
  const flags = [
    ['semi_auto_action_loop', 'true'],
    ['loop_mode', 'mock_only'],
    ['action_queue_mock_only', String(queue.actionQueueMockOnly)],
    ['noop_executor_fixture', 'true'],
    ['executor_mode', 'noop_fixture'],
    ['simulated_only', 'true'],
    ['real_executor_implemented', 'false'],
    ['executor_implemented', String(queue.executorImplemented)],
    ['executor_permission', String(queue.executorPermission)],
    ['auto_execute_enabled', String(queue.autoExecuteEnabled)],
    ['auto_send_enabled', String(queue.autoSendEnabled)],
    ['write_permission', String(queue.writePermission)],
    ['git_action_permission', String(queue.gitActionPermission)],
    ['npm_action_permission', String(queue.npmActionPermission)],
    ['push_permission', String(queue.pushPermission)],
  ] as const;

  return (
    <section className="action-panel-block action-gate-summary" aria-label="Action queue mock panel">
      <span className="action-panel-label">行动队列预览 / Action Queue Mock</span>
      <h3>Action queue is a planning preview, not execution</h3>
      <p>{queue.queuePolicy}. It never displays real Run, Execute, Commit, or Push controls.</p>

      <div className="import-status-grid" aria-label="action queue mock flags">
        {flags.map(([label, value]) => (
          <QueueMetric key={label} label={label} value={value} />
        ))}
      </div>

      <div className="action-control-grid" aria-label="locked action queue items">
        {queue.items.map((item) => (
          <article key={item.queueId} className="receipt-audit-card">
            <span className="action-panel-label">{item.queueId}</span>
            <h3>{item.proposedAction}</h3>
            <dl className="action-field-list">
              <QueueField label="action_id" value={item.actionId} />
              <QueueField label="approval_id" value={item.approvalId} />
              <QueueField label="envelope_hash" value={item.envelopeHash} />
              <QueueField label="risk_level" value={item.riskLevel} />
              <QueueField label="allowed_scope" value={item.allowedScope.join(', ')} />
              <QueueField label="forbidden_actions" value={item.forbiddenActions.join(', ')} />
              <QueueField label="required_reviews" value={item.requiredReviews.join(', ')} />
              <QueueField label="required approval" value={item.requiredApproval} />
              <QueueField label="required review" value={item.requiredReview} />
              <QueueField label="required receipt" value={item.requiredReceipt} />
              <QueueField label="blocked reason" value={item.blockedReason} />
              <QueueField label="next decision" value={item.nextDecision} />
            </dl>
          </article>
        ))}
      </div>

      <section className="receipt-audit-card" aria-label="denied queue controls">
        <span className="action-panel-label">Denied controls / 禁止控件</span>
        <h3>real action buttons = 0</h3>
        <ul>
          {queue.deniedControls.map((control) => (
            <li key={control}>{control}</li>
          ))}
        </ul>
      </section>
    </section>
  );
}

function QueueMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="import-metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function QueueField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
