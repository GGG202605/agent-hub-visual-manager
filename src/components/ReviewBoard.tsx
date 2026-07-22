import type { ReviewItem, RunItem, Severity, TaskItem } from '../types';

interface ReviewBoardProps {
  tasks: TaskItem[];
  runs: RunItem[];
  reviews: ReviewItem[];
}

const severities: Severity[] = ['High', 'Medium', 'Low'];

function severityCounts(items: Array<{ severity: Severity }>) {
  return severities.map((severity) => ({
    severity,
    count: items.filter((item) => item.severity === severity).length,
  }));
}

export function ReviewBoard({ tasks, runs, reviews }: ReviewBoardProps) {
  const combinedSeverity = severityCounts([...tasks, ...reviews]);

  return (
    <section className="section-card wide-card">
      <div className="section-heading board-heading">
        <div>
          <p className="eyebrow">Task / Run / Review</p>
          <h2>Review and decision board</h2>
        </div>
        <div className="severity-summary">
          {combinedSeverity.map((item) => (
            <span key={item.severity} className={`severity-tag severity-${item.severity.toLowerCase()}`}>
              {item.severity}: {item.count}
            </span>
          ))}
        </div>
      </div>
      <div className="board-note">
        <strong>Conditional commit gate</strong>
        <span>Scenario 4 may commit only after build exit code 0, exact-path diffs, and AG-SEC/AG-REVIEW High/Medium findings at 0; A/B/C execution beyond this mock patch still needs user approval.</span>
      </div>
      <div className="board-grid">
        <div className="board-column">
          <h3>Tasks</h3>
          {tasks.map((task) => (
            <article key={task.id} className="board-row">
              <span className="row-id">{task.id}</span>
              <strong>{task.title}</strong>
              <p>{task.owner} / {task.status}</p>
              <span className={`severity-tag severity-${task.severity.toLowerCase()}`}>{task.severity}</span>
            </article>
          ))}
        </div>
        <div className="board-column">
          <h3>Runs</h3>
          {runs.map((run) => (
            <article key={run.id} className="board-row">
              <span className="row-id">{run.id}</span>
              <strong>{run.summary}</strong>
              <p>{run.taskId} / {run.status}</p>
              <small>{run.evidence}</small>
            </article>
          ))}
        </div>
        <div className="board-column">
          <h3>Reviews</h3>
          {reviews.map((review) => (
            <article key={review.id} className="board-row">
              <span className="row-id">{review.id}</span>
              <strong>{review.kind} review</strong>
              <p>{review.target}</p>
              <div className="row-inline">
                <span className={`severity-tag severity-${review.severity.toLowerCase()}`}>{review.severity}</span>
                <span>{review.status}</span>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
