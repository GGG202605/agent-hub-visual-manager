interface PanelIndexCardProps {
  panels: readonly string[];
}

export function PanelIndexCard({ panels }: PanelIndexCardProps) {
  return (
    <section className="action-panel-block action-envelope-summary" aria-label="PanelIndexCard">
      <span className="action-panel-label">PanelIndexCard</span>
      <h3>v0.1 product view index</h3>
      <p>Panel marker: PanelIndexCard</p>
      <div className="action-gate-tags" aria-label="productized panel index">
        {panels.map((panel) => (
          <span key={panel}>{panel}</span>
        ))}
      </div>
    </section>
  );
}
