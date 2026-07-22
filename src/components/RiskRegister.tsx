import type { RiskItem } from '../types';

interface RiskRegisterProps {
  risks: RiskItem[];
}

export function RiskRegister({ risks }: RiskRegisterProps) {
  return (
    <section className="section-card risk-card">
      <div className="section-heading">
        <p className="eyebrow">Risk register</p>
        <h2>风险登记表</h2>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>risk_id</th>
              <th>severity</th>
              <th>description</th>
              <th>mitigation</th>
              <th>blocking</th>
            </tr>
          </thead>
          <tbody>
            {risks.map((risk) => (
              <tr key={risk.riskId}>
                <td>{risk.riskId}</td>
                <td>
                  <span className={`severity-tag severity-${risk.severity.toLowerCase()}`}>{risk.severity}</span>
                </td>
                <td>{risk.description}</td>
                <td>{risk.mitigation}</td>
                <td>{risk.blocking ? 'blocking' : 'monitoring'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}