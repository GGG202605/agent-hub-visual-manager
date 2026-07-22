import type { HandoffEvidenceView } from '../types';

interface HandoffEvidencePanelProps {
  evidence: HandoffEvidenceView;
}

export function HandoffEvidencePanel({ evidence }: HandoffEvidencePanelProps) {
  return (
    <section className="action-panel-block action-selected-decision" aria-label="Handoff evidence panel">
      <span className="action-panel-label">监督式交接证据 / Handoff Evidence</span>
      <h3>supervised_handoff_evidence=true</h3>
      <p>{evidence.summary}</p>

      <div className="import-status-grid" aria-label="handoff evidence safety flags">
        {evidence.safetyFlags.map((flag) => (
          <EvidenceMetric key={flag.label} label={flag.label} value={flag.value} />
        ))}
      </div>

      <div className="receipt-timeline" aria-label="handoff evidence records">
        {evidence.evidenceRecords.map((record, index) => (
          <article key={record.id} className={`receipt-timeline-step receipt-${record.status}`}>
            <span>{String(index + 1).padStart(2, '0')}</span>
            <strong>{record.title}</strong>
            <small>{record.evidence}</small>
            <small>{record.receipt}</small>
            <small>{record.boundary}</small>
          </article>
        ))}
      </div>

      <div className="receipt-audit-grid" aria-label="handoff evidence requirements">
        <EvidenceList title="回执要求 / Receipt requirements" items={evidence.receiptRequirements} />
        <EvidenceList title="阻断真实动作 / Blocked real actions" items={evidence.blockedRealActions} />
      </div>

      <div className="action-policy-footer">
        <strong>Handoff evidence records approval state; it does not execute action.</strong>
        <span>Human approval remains required before any real action.</span>
        <span>Receipt templates are evidence requirements, not proof of execution.</span>
      </div>
    </section>
  );
}

function EvidenceMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="import-metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function EvidenceList({ title, items }: { title: string; items: string[] }) {
  return (
    <section className="receipt-audit-card">
      <span className="action-panel-label">{title}</span>
      <h3>{items.length} items</h3>
      <ul>
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </section>
  );
}
