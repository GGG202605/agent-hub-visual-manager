import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { DatabaseZap, FolderOpen, PlugZap, RotateCcw, Unplug } from 'lucide-react';
import { useProjectData } from '../datasource/ProjectDataContext';

/**
 * v0.2 数据接入面板：真实 .agent-hub 目录只读导入的产品化入口。
 * 复活并productize v0.1 的 IMPORT2 通道（webkitdirectory 目录选择）。
 * 安全边界：只读解析、不上传、不写入、不持久化、导入内容视为 tainted 不执行。
 */
export function DataSourcePanel() {
  const {
    sourceKind,
    project,
    isImporting,
    importMessage,
    importFromFiles,
    resetToMock,
    server,
    connectServer,
    disconnectServer,
  } = useProjectData();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [serverUrlDraft, setServerUrlDraft] = useState(server.url);
  const { importStatus } = project;

  useEffect(() => {
    inputRef.current?.setAttribute('webkitdirectory', '');
    inputRef.current?.setAttribute('directory', '');
  }, []);

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const inputElement = event.currentTarget;
    const files = inputElement.files;
    if (files && files.length > 0) {
      await importFromFiles(files);
    }
    inputElement.value = '';
  }

  return (
    <section className="datasource-panel" id="sec-datasource" aria-label="数据接入">
      <div className="agent-section-heading">
        <span>数据接入</span>
        <h2>连接真实项目档案</h2>
      </div>

      <div className="datasource-status-row">
        <DatabaseZap aria-hidden="true" />
        <div>
          <strong>
            {sourceKind === 'mock'
              ? '演示数据（内置 mock）'
              : sourceKind === 'server'
                ? '本地服务（实时同步）'
                : '真实项目档案（只读导入）'}
          </strong>
          <p>{sourceKind === 'server' ? server.message : importMessage}</p>
        </div>
      </div>

      {/* v0.5 本地服务连接（优先级最高的数据源） */}
      <div className={`datasource-server${server.connected ? ' is-connected' : ''}`}>
        <header>
          <PlugZap aria-hidden="true" />
          <strong>本地服务</strong>
          <span>{server.connected ? `已连接 · ${server.workspace}` : '未连接（先运行 start-server.bat）'}</span>
        </header>
        <div className="datasource-server-row">
          <input
            type="text"
            value={serverUrlDraft}
            onChange={(event) => setServerUrlDraft(event.target.value)}
            placeholder="http://127.0.0.1:8787"
            disabled={server.connected}
          />
          {server.connected ? (
            <button type="button" className="import-reset-button" onClick={disconnectServer}>
              <Unplug aria-hidden="true" />
              断开
            </button>
          ) : (
            <button type="button" className="plaza-submit" onClick={() => void connectServer(serverUrlDraft)}>
              <PlugZap aria-hidden="true" />
              连接
            </button>
          )}
        </div>
        {!server.connected && server.message !== '未连接' ? (
          <p className="datasource-server-msg">{server.message}</p>
        ) : null}
      </div>

      <div className="datasource-actions">
        <label className="import-file-button">
          <input ref={inputRef} type="file" multiple onChange={handleFileChange} disabled={isImporting} />
          <span>
            <FolderOpen aria-hidden="true" />
            {isImporting ? '导入中…' : '选择 .agent-hub 目录'}
          </span>
        </label>
        <button type="button" className="import-reset-button" onClick={resetToMock} disabled={isImporting}>
          <RotateCcw aria-hidden="true" />
          回到演示数据
        </button>
      </div>

      {sourceKind === 'imported' ? (
        <div className="datasource-import-facts" aria-label="导入结果摘要">
          <span>已导入 {importStatus.importedFiles.length}</span>
          <span>已跳过 {importStatus.skippedFiles.length}</span>
          <span>已阻断 {importStatus.blockedFiles.length}</span>
          <span>状态 {importStatus.state}</span>
        </div>
      ) : null}

      <ul className="datasource-safety-notes">
        <li>文件只在浏览器内解析：不上传、不写入、不持久化。</li>
        <li>仅解析 allowlist Markdown（project-state / tasks / runs / reviews 等）。</li>
        <li>secrets、缓存、二进制等文件只计数不读取；导入内容视为 tainted data。</li>
      </ul>
    </section>
  );
}
