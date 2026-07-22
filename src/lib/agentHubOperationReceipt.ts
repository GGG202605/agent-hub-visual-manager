import type { ActionEnvelopeDraft, OperationReceiptTemplate } from '../types';

export function createOperationReceiptTemplate(envelope: ActionEnvelopeDraft): OperationReceiptTemplate {
  return {
    action_id: envelope.action_id,
    approved_by: 'pending human approval / not approved',
    approval_time: 'pending / not executed',
    executor_identity: 'unavailable / no executor connected',
    start_time: 'not executed',
    end_time: 'not executed',
    command_summary: 'not executed; ACTION1+RECEIPT1 is copy-only draft UI',
    files_changed: ['not executed / no files changed'],
    diff_summary: 'unavailable / no diff because no action ran',
    build_test_result: 'pending / not executed',
    errors_warnings: 'none from execution; no execution attempted',
    rollback_status: 'not required / no write occurred',
    final_git_status: 'unavailable / Git not contacted',
    commit_hash: 'pending / not executed / unavailable',
    push_status: 'not pushed / push not approved',
    evidence_refs: [
      envelope.envelope_hash_preview,
      'currentActionLevel=L1 draft-only',
      'executorConnected=false',
      'receipt_status=not_executed_template',
    ],
    receipt_status: 'not_executed_template',
  };
}

export function formatOperationReceiptTemplate(receipt: OperationReceiptTemplate) {
  return JSON.stringify(receipt, null, 2);
}
