import { CommandShell } from './components/CommandShell';
import { ConnectorProvider } from './datasource/ConnectorContext';
import { ProjectDataProvider } from './datasource/ProjectDataContext';

/**
 * v0.4 应用入口：单屏横版"百家广场"控制台。
 * ProjectDataProvider 供数（mock / 真实 .agent-hub 只读导入）；
 * ConnectorProvider 管理外部智能体接入（Claude / Codex / DeepSeek / 自定义）。
 */
export default function App() {
  return (
    <ProjectDataProvider>
      <ConnectorProvider>
        <CommandShell />
      </ConnectorProvider>
    </ProjectDataProvider>
  );
}
