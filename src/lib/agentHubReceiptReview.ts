import type { OperationReceiptTemplate, ReceiptReviewItem, ReceiptReviewView } from '../types';

export function createReceiptReviewView(receipt: OperationReceiptTemplate): ReceiptReviewView {
  return {
    receipt_status: receipt.receipt_status,
    action_id: receipt.action_id || 'missing-action-id',
    approval_status: statusItem('审批状态 / approval', receipt.approved_by, 'pending'),
    executor_status: statusItem('执行器状态 / executor', receipt.executor_identity, 'unavailable'),
    command_summary_status: statusItem('命令摘要 / command summary', receipt.command_summary, 'not_executed'),
    files_changed_status: statusItem('文件变化 / files changed', receipt.files_changed.join(', '), 'not_executed'),
    diff_summary_status: statusItem('diff 摘要 / diff summary', receipt.diff_summary, 'unavailable'),
    build_test_status: statusItem('build/test 状态', receipt.build_test_result, 'pending'),
    final_git_status: statusItem('最终 Git 状态 / final git', receipt.final_git_status, 'unavailable'),
    commit_hash_status: statusItem('commit hash', receipt.commit_hash, 'pending'),
    push_status: statusItem('push 状态', receipt.push_status, 'not_executed'),
    evidence_refs_status: statusItem(
      '证据引用 / evidence refs',
      receipt.evidence_refs.length > 0 ? receipt.evidence_refs.join(', ') : '未执行 / 未回流',
      'template',
    ),
    missing_evidence_checklist: [
      '缺失真实 approval_time：未执行 / 未回流。',
      '缺失 executor_identity：未接入执行器。',
      '缺失 command_summary：没有命令被运行。',
      '缺失 files_changed/diff_summary：没有写入或 diff。',
      '缺失 build/test result：本回执不是执行结果。',
      '缺失 final_git_status/commit_hash/push_status：未调用 Git 或 push。',
    ],
    blocked_reason:
      '执行未发生：当前仅为 Operation Receipt 模板审计，L1 draft-only，real dry-run / executor / write / push 均未批准。',
    receipt_timeline: [
      {
        step: '模板生成 / template generated',
        status: 'template_ready',
        note: '从 Action Envelope 草案派生，不代表真实执行。',
      },
      {
        step: '用户审批 / human approval',
        status: 'blocked',
        note: '等待用户审批；imported option 不能自动授权。',
      },
      {
        step: 'Pro 复核 / Pro review',
        status: 'blocked',
        note: '真实 dry-run 或 executor 前需要单独 Pro review。',
      },
      {
        step: '执行 / execution',
        status: 'not_started',
        note: '未接入 executor，未运行命令。',
      },
      {
        step: '证据回流 / evidence return',
        status: 'not_started',
        note: '没有真实 receipt；当前仅展示缺失证据清单。',
      },
    ],
  };
}

export function formatReceiptReviewView(review: ReceiptReviewView) {
  return JSON.stringify(review, null, 2);
}

function statusItem(
  label: string,
  value: string | undefined,
  status: ReceiptReviewItem['status'],
): ReceiptReviewItem {
  const safeValue = value && value.trim() ? value : '未执行 / 未回流';

  return {
    label,
    value: safeValue,
    status,
    note: statusNote(status),
  };
}

function statusNote(status: ReceiptReviewItem['status']) {
  const notes: Record<ReceiptReviewItem['status'], string> = {
    pending: '等待审批或未来回流；当前没有真实结果。',
    not_executed: '执行未发生；不得伪造成真实结果。',
    unavailable: '未连接对应能力；状态不可用。',
    template: '模板字段，仅用于审计预览。',
  };

  return notes[status];
}
