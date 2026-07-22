import { useEffect, useState } from 'react';
import { FolderGit2, RefreshCw } from 'lucide-react';
import { fetchWorkspaces } from '../lib/serverBridge';
import { useProjectData } from '../datasource/ProjectDataContext';

/**
 * v1.0 多项目管理面板：查看当前/最近工作区，一键切换（需本地服务连接）。
 * 切换后服务端重挂文件监听，全界面随 SSE 自动刷新。
 */
export function ProjectsPanel() {
  const { server, switchWorkspace } = useProjectData();
  const [recent, setRecent] = useState<string[]>([]);
  const [pathDraft, setPathDraft] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  async function refreshList() {
    if (!server.connected) return;
    try {
      const payload = await fetchWorkspaces(server.url);
      setRecent(payload.recent);
    } catch {
      setMessage('无法获取工作区列表');
    }
  }

  useEffect(() => {
    void refreshList();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [server.connected, server.workspace]);

  async function handleSwitch(target: string) {
    setBusy(true);
    setMessage('切换中…');
    const error = await switchWorkspace(target);
    setMessage(error ? `切换失败：${error}` : '已切换，界面已同步');
    setBusy(false);
    void refreshList();
  }

  if (!server.connected) {
    return (
      <div className="projects-panel">
        <p className="connector-intro">多项目管理需要本地服务：请先运行 start-server.bat，并在"数据接入"里连接。</p>
      </div>
    );
  }

  return (
    <div className="projects-panel">
      <section className="projects-current" aria-label="当前项目">
        <FolderGit2 aria-hidden="true" />
        <div>
          <strong>当前项目</strong>
          <p>{server.workspace}</p>
        </div>
        <button type="button" onClick={() => void refreshList()} title="刷新列表" aria-label="刷新列表">
          <RefreshCw aria-hidden="true" />
        </button>
      </section>

      <section aria-label="切换到新项目" className="projects-add">
        <header>切换 / 添加项目（需包含 .agent-hub 目录）</header>
        <div className="projects-add-row">
          <input
            type="text"
            value={pathDraft}
            onChange={(event) => setPathDraft(event.target.value)}
            placeholder="例如 D:\Projects\my-project"
            disabled={busy}
          />
          <button
            type="button"
            className="plaza-submit"
            disabled={busy || !pathDraft.trim()}
            onClick={() => void handleSwitch(pathDraft.trim())}
          >
            切换
          </button>
        </div>
        {message ? <p className="projects-msg">{message}</p> : null}
      </section>

      <section aria-label="最近项目" className="projects-recent">
        <header>最近项目</header>
        <ul>
          {recent.map((item) => (
            <li key={item} className={item === server.workspace ? 'is-current' : ''}>
              <span title={item}>{item}</span>
              {item === server.workspace ? (
                <em>当前</em>
              ) : (
                <button type="button" disabled={busy} onClick={() => void handleSwitch(item)}>
                  切换
                </button>
              )}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
