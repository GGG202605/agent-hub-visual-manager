import type { ProvenanceItem } from '../types';

interface ProvenancePanelProps {
  items: ProvenanceItem[];
}

export function ProvenancePanel({ items }: ProvenancePanelProps) {
  return (
    <section className="section-card provenance-card">
      <div className="section-heading">
        <p className="eyebrow">Provenance</p>
        <h2>证据链</h2>
      </div>
      <div className="provenance-list">
        {items.map((item) => (
          <article key={item.id} className="provenance-row">
            <div className="row-id">{item.id}</div>
            <dl>
              <div>
                <dt>source artifact</dt>
                <dd>{item.sourceArtifact}</dd>
              </div>
              <div>
                <dt>generated artifact</dt>
                <dd>{item.generatedArtifact}</dd>
              </div>
              <div>
                <dt>review id</dt>
                <dd>{item.reviewId}</dd>
              </div>
              <div>
                <dt>commit id</dt>
                <dd>{item.commitId}</dd>
              </div>
              <div>
                <dt>current status</dt>
                <dd>{item.currentStatus}</dd>
              </div>
            </dl>
          </article>
        ))}
      </div>
    </section>
  );
}