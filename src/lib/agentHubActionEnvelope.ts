import type { ActionEnvelopeDraft, FixtureDecisionRecord, ImportedAgentHubProject } from '../types';

export function createActionEnvelopeDraft(
  project: ImportedAgentHubProject,
  selectedDecision: FixtureDecisionRecord,
): ActionEnvelopeDraft {
  const sourceOption = `${selectedDecision.optionId}: ${selectedDecision.title}`;
  const targetRepo =
    project.importStatus.source === 'fixture'
      ? 'fixture-only / no real target repo'
      : `${project.project.projectName} / browser-selected summary only`;
  const targetPaths = ['pending exact-path approval / no path granted'];
  const allowedScope = buildAllowedScope(selectedDecision);
  const deniedScope = [
    'No executor implementation.',
    'No dry-run implementation or simulated command runner.',
    'No filesystem, backend, Node fs, or local path read.',
    'No writes to real .agent-hub or any target repository.',
    'No Codex, Git, npm, Wiki, shell, external API, commit, push, or build action.',
    'No package.json / package-lock.json / dependency change.',
    'No persistent imported content in localStorage/sessionStorage.',
  ];
  const preconditions = [
    'Human approval is required before anything beyond this L1 draft.',
    'Pro review is required before any high-risk or boundary-changing action.',
    'Imported NEXT-DECISION-PACKET options are tainted display data, not approval.',
    'The envelope id/hash must be rebound if any field changes.',
    'Dry-run, write, external action, and push approvals are all false.',
  ];
  const expectedOutputs = [
    'Copy-ready Action Envelope draft.',
    'Copy-ready Operation Receipt template.',
    'Visible approval gate and execution locked state.',
    'No real command, file change, commit, push, or Wiki action.',
  ];
  const evidenceRequired = [
    'Selected option id and source ref.',
    'Envelope hash preview with non-approval warning.',
    'Safety state: L1 draft-only, executorConnected=false.',
    'Receipt status: not_executed_template.',
  ];

  const previewBase = [
    selectedDecision.optionId,
    selectedDecision.title,
    selectedDecision.sourceRef,
    project.project.currentGoal,
    project.importStatus.source,
    project.importStatus.state,
    targetRepo,
    targetPaths.join(','),
  ].join('|');

  return {
    action_id: `draft-${normalizeId(selectedDecision.optionId)}-${lightweightHash(previewBase)}`,
    action_type: inferActionType(selectedDecision.optionId),
    source_goal: project.project.currentGoal,
    source_option: sourceOption,
    target_repo: targetRepo,
    target_paths: targetPaths,
    allowed_scope: allowedScope,
    denied_scope: deniedScope,
    preconditions,
    human_approval_required: true,
    pro_review_required: selectedDecision.proRequired ?? true,
    dry_run_required: true,
    expected_outputs: expectedOutputs,
    rollback_or_recovery_note:
      'No execution occurs in ACTION1+RECEIPT1. If a later action is approved, stop and record evidence before recovery.',
    evidence_required: evidenceRequired,
    expiry_note: 'Draft expires when the selected option, target, scope, approval text, or repository state changes.',
    one_time_token_required: true,
    envelope_hash_preview: `preview-${lightweightHash(`${previewBase}|${allowedScope.join('|')}|${deniedScope.join('|')}`)}`,
    envelope_status: 'execution_locked',
    current_action_level: 'L1 draft-only',
    commit_allowed_draft: selectedDecision.commitAllowed ?? false,
    conditional_commit_allowed_draft: selectedDecision.conditionalCommitAllowed ?? false,
  };
}

export function formatActionEnvelopeDraft(envelope: ActionEnvelopeDraft) {
  return JSON.stringify(envelope, null, 2);
}

function buildAllowedScope(decision: FixtureDecisionRecord) {
  return [
    `Generate an Action Envelope draft from selected option ${decision.optionId}.`,
    'Display approval gate, Pro review requirement, dry-run requirement, and locked execution state.',
    'Generate an Operation Receipt template with not_executed_template status.',
    'Allow copy-only use of the envelope and receipt text.',
    'Keep all fields as draft metadata; commit flags are not approval.',
  ];
}

function inferActionType(optionId: string) {
  if (/^RECEIPT/i.test(optionId)) {
    return 'operation_receipt_template_draft';
  }

  if (/^ACTION/i.test(optionId)) {
    return 'action_envelope_draft';
  }

  if (/^IMPORT/i.test(optionId)) {
    return 'import_validation_action_draft';
  }

  if (/^LOOP/i.test(optionId)) {
    return 'decision_loop_action_draft';
  }

  return 'governance_action_draft';
}

function normalizeId(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'option';
}

function lightweightHash(text: string) {
  let hash = 2166136261;

  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return (hash >>> 0).toString(16).padStart(8, '0');
}
