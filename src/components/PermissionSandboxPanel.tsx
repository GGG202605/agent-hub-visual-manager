import { useMemo, useState } from 'react';

interface PermissionOption {
  id: string;
  label: string;
  labelZh: string;
  summary: string;
  required: boolean;
  lockedFalse?: boolean;
}

const permissionOptions: PermissionOption[] = [
  {
    id: 'read-selected-agent-hub-files',
    label: 'read selected .agent-hub files',
    labelZh: '读取用户选择的 .agent-hub 文件',
    summary: '仅限浏览器 file input 选择的 synthetic 文件；不上传、不递归、不读取本地路径。',
    required: true,
  },
  {
    id: 'parse-preview-only',
    label: 'parse preview only',
    labelZh: '仅生成解析预览',
    summary: '勾选结果只表达 human approval boundary；parsed preview 不等于 approval。',
    required: true,
  },
  {
    id: 'manual-copy-to-codex',
    label: 'manual copy to Codex',
    labelZh: '人工复制到 Codex',
    summary: 'handoff 只允许用户手动复制/粘贴；UI 不会自动发送指令。',
    required: true,
  },
  {
    id: 'mock-approval-not-real',
    label: 'mock approval is not real permission',
    labelZh: 'Mock 审批不是真实权限',
    summary: '勾选只表示 UI 状态；不会授予 executor、write、Git、npm、Wiki 或 push 权限。',
    required: true,
  },
  {
    id: 'no-write',
    label: 'no write',
    labelZh: '不写入文件',
    summary: '不会创建、修改、删除或覆盖任何项目文件。',
    required: true,
    lockedFalse: true,
  },
  {
    id: 'no-executor',
    label: 'no executor',
    labelZh: '不连接执行器',
    summary: '不会调用 Codex executor、shell、dry-run 或真实 action。',
    required: true,
    lockedFalse: true,
  },
  {
    id: 'no-git-action',
    label: 'no Git action',
    labelZh: '不执行 Git action',
    summary: '不会 stage、commit、branch、merge 或读取真实仓库数据。',
    required: true,
    lockedFalse: true,
  },
  {
    id: 'no-npm-action',
    label: 'no npm action',
    labelZh: '不执行 npm action',
    summary: '不会通过 UI 触发 install、build、test、dev 或 preview。',
    required: true,
    lockedFalse: true,
  },
  {
    id: 'no-private knowledge base',
    label: 'no private knowledge base',
    labelZh: '不读写 private knowledge base',
    summary: '不会读取、生成、同步或写入 Wiki 内容。',
    required: true,
    lockedFalse: true,
  },
  {
    id: 'no-push',
    label: 'no push',
    labelZh: '不 push',
    summary: '不会发布远端分支或触发任何外部提交动作。',
    required: true,
    lockedFalse: true,
  },
];

export function PermissionSandboxPanel() {
  const [checkedPermissions, setCheckedPermissions] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(permissionOptions.map((option) => [option.id, option.required])),
  );

  const selectedCount = useMemo(
    () => permissionOptions.filter((option) => checkedPermissions[option.id]).length,
    [checkedPermissions],
  );

  const allRequiredChecked = permissionOptions.every((option) => !option.required || checkedPermissions[option.id]);
  const uncheckedRequired = permissionOptions
    .filter((option) => option.required && !checkedPermissions[option.id])
    .map((option) => option.label);

  return (
    <section className="action-panel-block action-gate-summary" aria-label="Permission Sandbox mock">
      <span className="action-panel-label">权限沙箱 / Permission Sandbox</span>
      <h3>Browser-only selected-file permission sandbox mock</h3>
      <p>
        本轮 selected-file input 只在浏览器内存读取用户手动选择的 synthetic 文件。勾选状态只改变下方 mock permission summary；
        不上传文件，不打开 directory picker，不读取本地路径，不连接 fs/backend，也不继承任何 action approval。
      </p>

      <div className="import-status-grid" aria-label="permission sandbox locked flags">
        <PermissionMetric label="permission_sandbox_mock" value="true" />
        <PermissionMetric label="selected_file_import_enabled" value="true" />
        <PermissionMetric label="browser_only_import" value="true" />
        <PermissionMetric label="semi_auto_loop" value="true" />
        <PermissionMetric label="instruction_draft_only" value="true" />
        <PermissionMetric label="human_approval_required" value="true" />
        <PermissionMetric label="copy_to_codex_manual" value="true" />
        <PermissionMetric label="auto_send_enabled" value="false" />
        <PermissionMetric label="auto_execute_enabled" value="false" />
        <PermissionMetric label="imported_content_as_instruction" value="false" />
        <PermissionMetric label="file_upload_implemented" value="false" />
        <PermissionMetric label="directory_picker_enabled" value="false" />
        <PermissionMetric label="fs_access" value="false" />
        <PermissionMetric label="backend_import" value="false" />
      </div>

      <div className="action-control-grid" aria-label="permission checklist mock">
        {permissionOptions.map((option) => (
          <label className="receipt-audit-card" key={option.id}>
            <span className="action-panel-label">
              {option.required ? 'required mock consent' : 'optional mock consent'}
            </span>
            <span>
              <input
                checked={checkedPermissions[option.id] ?? false}
                onChange={(event) =>
                  setCheckedPermissions((current) => ({
                    ...current,
                    [option.id]: event.target.checked,
                  }))
                }
                type="checkbox"
              />{' '}
              <strong>{option.labelZh}</strong>
            </span>
            <small>{option.label}</small>
            <p>{option.summary}</p>
          </label>
        ))}
      </div>

      <div className="receipt-audit-grid" aria-label="mock permission summary">
        <section className="receipt-audit-card">
          <span className="action-panel-label">Mock permission summary / 权限摘要</span>
          <h3>{allRequiredChecked ? 'ready_for_preview_mock=true' : 'ready_for_preview_mock=false'}</h3>
          <dl className="action-field-list">
            <PermissionField label="checked_permission_count" value={`${selectedCount}/${permissionOptions.length}`} />
            <PermissionField label="selected_file_import_enabled" value="true" />
            <PermissionField label="browser_only_import" value="true" />
            <PermissionField label="import_result" value="parsed_preview_only" />
            <PermissionField label="instruction_draft_result" value="copyable_draft_only" />
            <PermissionField label="handoff_result" value="human_review_manual_copy_only" />
            <PermissionField label="real_import_triggered" value="false" />
            <PermissionField label="write_or_executor_triggered" value="false" />
            <PermissionField label="auto_send_or_execute_triggered" value="false" />
          </dl>
        </section>

        <section className="receipt-audit-card">
          <span className="action-panel-label">Stop conditions / 停止条件</span>
          <h3>真实能力仍未连接</h3>
          <ul>
            {uncheckedRequired.length > 0 ? (
              uncheckedRequired.map((item) => <li key={item}>mock consent missing: {item}</li>)
            ) : (
              <li>全部 required mock consent 已勾选，但仍只允许 parsed preview。</li>
            )}
            <li>当前 file input 仅限 browser memory preview；任何 upload / directory picker 都需要下一 Goal 显式批准。</li>
            <li>Instruction draft 只允许 human copy/review；不会自动发送给 Codex，也不会触发 executor。</li>
            <li>Approval in UI mock does not grant real permissions；仍需要真实用户审批与 Pro closeout。</li>
            <li>任何 fs/backend/local path read 都需要单独 architecture + Pro gate。</li>
          </ul>
        </section>
      </div>
    </section>
  );
}

function PermissionMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="import-metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function PermissionField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
