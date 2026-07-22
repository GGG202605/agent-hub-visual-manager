import type { SampleImportPreviewViewModel } from '../types';

interface SampleImportPreviewPanelProps {
  preview: SampleImportPreviewViewModel;
}

export function SampleImportPreviewPanel({ preview }: SampleImportPreviewPanelProps) {
  return (
    <section className="action-panel-block action-gate-summary" aria-label="Browser-only sample import preview">
      <span className="action-panel-label">样本导入预览 / Sample Import Preview</span>
      <h3>Browser-only synthetic sample import preview</h3>
      <p>
        使用 bundled synthetic sample 展示 sample bundle -&gt; parser -&gt; parsed preview 链路。
        Import preview 不等于 approval；parser output 只作为 recommendation signal。
      </p>

      <div className="import-status-grid" aria-label="sample import safety flags">
        {preview.safetyFlags.map((flag) => (
          <SampleMetric key={flag.label} label={flag.label} value={flag.value} />
        ))}
      </div>

      <div className="dry-run-summary-grid" aria-label="sample bundle parser preview chain">
        {preview.chain.map((stage) => (
          <div key={stage.stageId}>
            <span>{stage.status}</span>
            <strong>{stage.label}</strong>
            <small>{stage.detail}</small>
          </div>
        ))}
      </div>

      <div className="action-control-grid" aria-label="sample parsed preview result">
        <section className="receipt-audit-card">
          <span className="action-panel-label">Parsed preview / 解析预览</span>
          <h3>{preview.parsedPreview.bundleId}</h3>
          <dl className="action-field-list">
            <SampleField label="state" value={preview.state} />
            <SampleField label="documents" value={String(preview.parsedPreview.documentCount)} />
            <SampleField label="total_bytes" value={String(preview.parsedPreview.totalBytes)} />
            <SampleField label="next_decision" value={preview.parsedPreview.nextDecision} />
            <SampleField label="recommendation" value={preview.parsedPreview.recommendationSignal} />
          </dl>
        </section>

        <section className="receipt-audit-card">
          <span className="action-panel-label">Coverage / 样本覆盖</span>
          <h3>project-state / task / run / review / goal / receipt / next-decision</h3>
          <dl className="action-field-list">
            {Object.entries(preview.parsedPreview.categories).map(([kind, count]) => (
              <SampleField key={kind} label={kind} value={String(count)} />
            ))}
          </dl>
        </section>

        <section className="receipt-audit-card">
          <span className="action-panel-label">Approval boundary / 审批边界</span>
          <h3>Preview only</h3>
          <ul>
            {preview.approvalBoundary.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>
      </div>

      <div className="receipt-audit-grid" aria-label="sample documents and denied capabilities">
        <section className="receipt-audit-card">
          <span className="action-panel-label">Sample records / 样本记录</span>
          <ul>
            {preview.documents.map((document) => (
              <li key={document.id}>
                <strong>{document.kind}</strong> {document.path} / {document.status}
              </li>
            ))}
          </ul>
        </section>

        <section className="receipt-audit-card">
          <span className="action-panel-label">Denied capabilities / 禁止能力</span>
          <ul>
            {preview.deniedCapabilities.map((capability) => (
              <li key={capability}>{capability}=false</li>
            ))}
          </ul>
        </section>
      </div>
    </section>
  );
}

function SampleMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="import-metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function SampleField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
