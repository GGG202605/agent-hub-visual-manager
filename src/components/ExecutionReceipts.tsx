import { useEffect, useState } from 'react';
import { ReceiptText } from 'lucide-react';
import { fetchReceipts, type ExecuteReceipt } from '../lib/serverBridge';
import { useProjectData } from '../datasource/ProjectDataContext';

/**
 * v1.0 执行回执台账（总览抽屉内）：
 * 展示本次服务运行以来的受控执行历史；持久台账在工作区 ai-output/RECEIPTS.md。
 */
export function ExecutionReceipts() {
  const { server } = useProjectData();
  const [receipts, setReceipts] = useState<ExecuteReceipt[]>([]);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!server.connected) return;
    fetchReceipts(server.url)
      .then((list) => setReceipts(list.slice().reverse()))
      .catch(() => setFailed(true));
  }, [server.connected, server.url]);

  if (!server.connected) return null;

  return (
    <section className="agent-side-panel exec-receipts" aria-label="执行回执台账">
      <div className="agent-side-heading">
        <span>
          <ReceiptText aria-hidden="true" /> 执行回执台账
        </span>
        <strong>持久记录在 ai-output/RECEIPTS.md</strong>
      </div>
      {failed ? (
        <p className="exec-receipts-empty">读取台账失败，可稍后重开本面板。</p>
      ) : receipts.length === 0 ? (
        <p className="exec-receipts-empty">本次服务运行尚无受控执行记录。</p>
      ) : (
        <ul className="exec-receipts-list">
          {receipts.slice(0, 20).map((receipt) => (
            <li key={receipt.seq} className={`is-${receipt.status}`}>
              <span className="exec-receipt-kind">{receipt.kind === 'save-note' ? '落盘' : '构建'}</span>
              <span className="exec-receipt-detail" title={receipt.detail}>
                {receipt.detail}
              </span>
              <em>{receipt.status === 'ok' ? '成功' : '失败'}</em>
              <time>{new Date(receipt.at).toLocaleTimeString()}</time>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
