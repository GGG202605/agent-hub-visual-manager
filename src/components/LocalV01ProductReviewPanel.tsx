import type { LocalV01ProductReviewView } from '../types';

interface LocalV01ProductReviewPanelProps {
  review: LocalV01ProductReviewView;
}

export function LocalV01ProductReviewPanel({ review }: LocalV01ProductReviewPanelProps) {
  return (
    <section className="action-panel-block action-envelope-summary" aria-label="LocalV01ProductReviewPanel">
      <span className="action-panel-label">LocalV01ProductReviewPanel</span>
      <h3>Local v0.1 product review</h3>
      <p>Panel marker: LocalV01ProductReviewPanel</p>
      <p>{review.summary}</p>

      <div className="action-control-grid" aria-label="local v0.1 product review answers">
        {review.answers.map((item) => (
          <article key={item.question} className="receipt-audit-card">
            <span className="action-panel-label">review answer</span>
            <h3>{item.question}</h3>
            <p>{item.answer}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
