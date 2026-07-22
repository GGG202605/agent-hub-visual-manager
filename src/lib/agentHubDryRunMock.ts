import type { ActionEnvelopeDraft, DryRunMockPlan } from '../types';

export function createDryRunMockPlan(envelope: ActionEnvelopeDraft): DryRunMockPlan {
  return {
    simulator_mode: 'fixture_only_mock',
    real_dry_run_approved: false,
    executor_connected: false,
    filesystem_access: false,
    shell_access: false,
    write_access: false,
    action_id: envelope.action_id,
    source_envelope: envelope.envelope_hash_preview,
    planned_checks: [
      '检查 envelope 是否有 action_id、action_type、source_goal 与 source_option。',
      '检查 target_paths 是否仍为 pending exact-path approval，而不探测真实路径。',
      '检查 denied_scope 是否包含 no filesystem / no shell / no write / no external action。',
      '检查 human_approval_required、pro_review_required、dry_run_required 是否可见。',
      '检查 commit_allowed_draft 与 conditional_commit_allowed_draft 只是草案字段。',
    ],
    blocked_real_actions: [
      '不读取文件系统。',
      '不运行命令。',
      '不写文件。',
      '不计算真实 diff。',
      '不探测真实路径是否存在。',
      '不调用 Codex/Git/npm/Wiki/shell。',
      '不生成真实 build/test/Git/push 结果。',
    ],
    expected_evidence_if_future_dry_run_is_approved: [
      'dry-run approval id and envelope hash binding',
      'simulator scope and exact target paths',
      'command summary without sensitive raw content',
      'not-written diff simulation summary',
      'build/test not-run or dry-run-only status',
      'final git status after dry-run',
      'receipt refs and review ids',
    ],
    stop_conditions: [
      'scope mismatch',
      'target path ambiguity',
      'dependency/package change appears',
      'real data or secret exposure risk appears',
      'filesystem or shell access would be required',
      'executor behavior becomes ambiguous',
      'Pro review is missing for boundary-changing work',
    ],
    next_approval_required: [
      'Explicit user approval for ACTION3-GATE or ACTION3-FIXTURE.',
      'Pro architecture review before any real dry-run.',
      'Exact path and command-class approval before any future implementation.',
      'Separate approval for build, Git, Wiki, push, or external action.',
    ],
    realDryRunImplemented: false,
  };
}

export function formatDryRunMockPlan(plan: DryRunMockPlan) {
  return JSON.stringify(plan, null, 2);
}
