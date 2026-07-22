import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { BoundedPilotPlan } from '../../components/plaza/BoundedPilotPlan';
import {
  createDemoScenario018AcceptanceSpec,
  DemoScenario018_APPROVED_PRICING,
  DemoScenario018_RECOMMENDED_TASK,
} from '../safePilotExecution';
import { SAFE_PILOT_AGENT_ORDER } from '../safePilotLauncher';

describe('BoundedPilotPlan', () => {
  it('renders a truthful non-executing preview without action surfaces', () => {
    const html = renderToStaticMarkup(<BoundedPilotPlan taskText="审查只读方案" onClose={() => undefined} />);
    expect(html).toContain('四 Agent 安全启动包');
    expect(html).toContain('未签发 · 未执行 · 0 次模型调用');
    expect(html).toContain('AG-COORD');
    expect(html).toContain('AG-REVIEW');
    expect(html).toContain('AG-COORD（孔子 · 协调 Agent）');
    expect(html).toContain('PRO（老子 · 专业评审 Agent）');
    expect(html).toContain('AG-SEC（韩非 · 安全 Agent）');
    expect(html).toContain('AG-REVIEW（惠子 · 复核 Agent）');
    expect(html).toContain('64,000 tokens');
    expect(html).toContain('费率未确认，执行阻塞');
    expect(html).toContain('任务');
    expect(html).toContain('对话');
    expect(html).toContain('操作');
    expect(html).toContain('审批');
    expect(html).toContain('服务端哈希与费用预检');
    expect(html).toContain('真实执行入口未开放');
    expect(html).not.toMatch(/保存纪要|运行构建|登记补丁|启动协同|开始执行/);
  });

  it('keeps the preview single-column inside the existing 390px breakpoint', () => {
    const styles = readFileSync(path.join(process.cwd(), 'src/styles.css'), 'utf8');
    expect(styles).toContain('@media (max-width: 520px)');
    expect(styles).toMatch(/\.pilot-plan \{\s+inset: 8px;\s+height: calc\(100% - 16px\);\s+max-height: calc\(100% - 16px\);/);
    expect(styles).toContain('.pilot-agent-grid, .pilot-handoffs, .pilot-budget-grid, .pilot-plan-columns, .pilot-pricing-grid { grid-template-columns: minmax(0, 1fr); }');
    expect(styles).toMatch(/\.pilot-plan \{[^}]*overflow-x:\s*hidden;[^}]*overflow-y:\s*auto;/s);
    expect(styles).toMatch(/\.pilot-plan \{[^}]*touch-action:\s*pan-y;[^}]*-webkit-overflow-scrolling:\s*touch;/s);
    expect(styles).toContain('.pilot-complete-message.is-failed { color: #994f45; }');
  });

  it('refreshes the issuance flag when SSE reconnects after a service restart', () => {
    const source = readFileSync(path.join(process.cwd(), 'src/datasource/ProjectDataContext.tsx'), 'utf8');
    expect(source).toContain('safePilotIssuanceEnabled: nextHealth.safePilotIssuanceEnabled === true');
    expect(source).toContain('serviceInstanceId: nextHealth.serviceInstanceId');
    expect(source).toMatch(/fetchHealth\(url\)\.then\(async \(nextHealth\) => \{[\s\S]*?setServer\([\s\S]*?await refreshRuntimeFromServer\(url\);/);
    expect(source).toContain("message: '已连接，文件变化实时同步'");
  });

  it('renders one DemoScenario018 specification across task, context and execution truth', () => {
    const acceptanceSpec = createDemoScenario018AcceptanceSpec(DemoScenario018_RECOMMENDED_TASK);
    const html = renderToStaticMarkup(
      <BoundedPilotPlan
        taskText={acceptanceSpec.taskText}
        onClose={() => undefined}
        modelBindings={SAFE_PILOT_AGENT_ORDER.map((agentCode) => ({
          agentCode,
          provider: 'deepseek' as const,
          model: 'deepseek-v4-flash',
          ready: true,
        }))}
        approvedPricing={DemoScenario018_APPROVED_PRICING}
        acceptanceSpec={acceptanceSpec}
        issuanceEnabled={false}
        executionActions={{
          issue: async () => { throw new Error('not called'); },
          runStage: async () => { throw new Error('not called'); },
          accept: async () => { throw new Error('not called'); },
          retry: async () => { throw new Error('not called'); },
          humanAccept: async () => { throw new Error('not called'); },
        }}
      />,
    );
    expect(html).toContain('产品规格 DemoScenario018 · 已验收实测基线 DemoScenario020');
    expect(html).toContain('产品化四 Agent 受控验收');
    expect(html).toContain('产品化单 run 执行门');
    expect(html).not.toContain('DemoScenario018 单 run 执行门');
    expect(html).toContain(DemoScenario018_RECOMMENDED_TASK);
    expect(html).toContain('DemoScenario017 产品化本地运维已完成并提交');
    expect(html).toContain('缓存未命中输入 ¥1/M');
    expect(html).toContain('保守最大费用 ¥0.0672');
    expect(html).toContain('查看将发送的完整脱敏上下文');
    expect(html).toContain('签发并开始本次受控验收');
    expect(html).toContain('服务端仍关闭');
    expect(html).toContain('四个均为 DeepSeek V4 Flash');
    expect(html).toContain('每次人工等待（分钟）');
    expect(html).toContain('value="5"');
    expect(html).toContain('默认 5 分钟，签发后锁定');
    expect(html).toContain('等待期间暂停 240 秒活跃时钟');
    expect(html).toContain('每次人工等待授权为 5 分钟');
    expect(html).not.toMatch(/DemoScenario014|DemoScenario015|首次真实试运行/);
    expect(html).not.toContain('authorizationToken');
    const source = readFileSync(path.join(process.cwd(), 'src/components/plaza/BoundedPilotPlan.tsx'), 'utf8');
    expect(source).toContain('本次重试将执行定向修复');
    expect(source).toContain('buildProductizedRetryFeedback');
  });
});
