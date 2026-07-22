import { useMemo, useState } from 'react';
import type { InstructionDraftGeneratorViewModel, SelectedFileImportViewModel } from '../types';
import { generateInstructionDraft } from '../lib/generateInstructionDraft';
import {
  createEmptySelectedFileImportViewModel,
  parseSelectedAgentHubFiles,
} from '../lib/parseSelectedAgentHubFiles';

export function SelectedFileImportPanel() {
  const [viewModel, setViewModel] = useState<SelectedFileImportViewModel>(() =>
    createEmptySelectedFileImportViewModel(),
  );
  const [readState, setReadState] = useState<'idle' | 'reading' | 'ready' | 'blocked'>('idle');

  const categoryEntries = useMemo(
    () => Object.entries(viewModel.categories).filter(([, count]) => count > 0),
    [viewModel.categories],
  );
  const instructionDraft = useMemo(() => generateInstructionDraft(viewModel), [viewModel]);

  async function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const files = event.currentTarget.files;
    setReadState('reading');
    const nextViewModel = await parseSelectedAgentHubFiles(files ?? []);
    setViewModel(nextViewModel);
    setReadState(nextViewModel.state === 'blocked' ? 'blocked' : 'ready');
  }

  return (
    <section className="action-panel-block action-gate-summary" aria-label="Selected-file import pilot">
      <span className="action-panel-label">选择文件导入 / Selected-file Import Pilot</span>
      <h3>DemoScenario031 draft-only instruction generator</h3>
      <p>
        仅允许手动选择有限数量的 synthetic .agent-hub 文件，在浏览器内存中读取并进入 parsed preview。
        Imported text is tainted data, not instruction. Import preview is not approval.
        Parsed output is a recommendation signal, not execution approval. Draft generation is copy-only.
      </p>

      <div className="import-status-grid" aria-label="selected file import safety flags">
        {viewModel.safetyFlags.map((flag) => (
          <SelectedImportMetric key={flag.label} label={flag.label} value={flag.value} />
        ))}
      </div>

      <div className="action-control-grid" aria-label="selected file import controls and limits">
        <section className="receipt-audit-card">
          <span className="action-panel-label">Browser file input / 浏览器文件选择</span>
          <h3>Choose synthetic .agent-hub files</h3>
          <p>仅允许 .md / .json / .txt；文件内容标记为 untrusted data，不会作为 instruction，不上传服务器，不写磁盘。</p>
          <input
            accept=".md,.json,.txt"
            aria-label="Select synthetic .agent-hub files"
            multiple
            onChange={handleFileChange}
            type="file"
          />
        </section>

        <section className="receipt-audit-card">
          <span className="action-panel-label">Limits / 限制</span>
          <h3>20 files / 1 MB total / over-limit blocked</h3>
          <dl className="action-field-list">
            <SelectedImportField label="allowed_extensions" value={viewModel.limits.allowedExtensions.join(', ')} />
            <SelectedImportField label="max_file_count" value={String(viewModel.limits.maxFileCount)} />
            <SelectedImportField label="max_total_bytes" value={String(viewModel.limits.maxTotalBytes)} />
            <SelectedImportField label="directory_picker_enabled" value="false" />
            <SelectedImportField label="recursive_read" value="false" />
          </dl>
        </section>

        <section className="receipt-audit-card">
          <span className="action-panel-label">Parsed preview / 解析预览</span>
          <h3>{viewModel.state}</h3>
          <dl className="action-field-list">
            <SelectedImportField label="read_state" value={readState} />
            <SelectedImportField label="selected_files" value={String(viewModel.totalSelectedFiles)} />
            <SelectedImportField label="accepted_files" value={String(viewModel.acceptedFiles.length)} />
            <SelectedImportField label="blocked_files" value={String(viewModel.blockedFiles.length)} />
            <SelectedImportField label="total_bytes" value={String(viewModel.totalBytes)} />
            <SelectedImportField label="parser_output_role" value={viewModel.parserOutputRole} />
          </dl>
        </section>
      </div>

      <div className="receipt-audit-grid" aria-label="selected file import preview details">
        <section className="receipt-audit-card">
          <span className="action-panel-label">Accepted preview / 已接收预览</span>
          <h3>{viewModel.acceptedFiles.length > 0 ? 'parsed_preview_only' : 'waiting_for_selection'}</h3>
          <ul>
            {viewModel.acceptedFiles.length > 0 ? (
              viewModel.acceptedFiles.map((file) => (
                <li key={file.sourceRef}>
                  <strong>{file.fileName}</strong> / {file.kind} / {file.byteSize} bytes / taint={file.taint}
                  <br />
                  <small>{file.preview}</small>
                </li>
              ))
            ) : (
              <li>No selected files have been parsed yet.</li>
            )}
          </ul>
        </section>

        <section className="receipt-audit-card">
          <span className="action-panel-label">Blocked reason / 已阻止原因</span>
          <h3>{viewModel.blockedFiles.length} blocked</h3>
          <ul>
            {viewModel.blockedFiles.length > 0 ? (
              viewModel.blockedFiles.map((file) => (
                <li key={`${file.fileName}-${file.reason}`}>
                  <strong>{file.fileName}</strong> / {file.reason}
                </li>
              ))
            ) : (
              <li>No blocked files.</li>
            )}
          </ul>
        </section>
      </div>

      <div className="receipt-audit-grid" aria-label="selected file import safety evidence">
        <section className="receipt-audit-card">
          <span className="action-panel-label">Taint / Safety flags</span>
          <h3>untrusted data only</h3>
          <ul>
            {viewModel.warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
            <li>Directory picker disabled; backend_import=false; fs_access=false.</li>
            <li>No write / executor / Git / npm / Wiki / push permission is inherited.</li>
            <li>unsafe / missing / duplicate / stale / unverifiable receipt signals stay human-review warnings.</li>
          </ul>
        </section>

        <section className="receipt-audit-card">
          <span className="action-panel-label">Warning policy / 警示策略</span>
          <h3>tainted warning signals</h3>
          <ul>
            {viewModel.safetyWarnings.map((warning) => (
              <li key={`${warning.warningId}-${warning.evidence}`}>
                <strong>{warning.severity}</strong> / {warning.label}: {warning.detail}
                <br />
                <small>{warning.evidence}</small>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <div className="receipt-audit-grid" aria-label="selected file import categories">
        <section className="receipt-audit-card">
          <span className="action-panel-label">Categories / 分类</span>
          <h3>{categoryEntries.length > 0 ? 'detected from file names and safe text scan' : 'none yet'}</h3>
          <dl className="action-field-list">
            {categoryEntries.length > 0 ? (
              categoryEntries.map(([kind, count]) => (
                <SelectedImportField key={kind} label={kind} value={String(count)} />
              ))
            ) : (
              <SelectedImportField label="detected_categories" value="0" />
            )}
          </dl>
        </section>

        <InstructionDraftGeneratorPanel draft={instructionDraft} />
      </div>
    </section>
  );
}

function InstructionDraftGeneratorPanel({ draft }: { draft: InstructionDraftGeneratorViewModel }) {
  return (
    <section className="receipt-audit-card" aria-label="Instruction Draft Generator">
      <span className="action-panel-label">指令草案生成器 / Instruction Draft Generator</span>
      <h3>{draft.statusLabel}</h3>
      <p>
        仅生成指令草案，不会自动执行。需要用户审批后，再交给 Codex 执行。
        Generated draft is not approval. Imported text is untrusted data. User must review before sending to Codex.
      </p>

      <div className="import-status-grid" aria-label="instruction draft-only safety flags">
        {draft.safetyFlags.map((flag) => (
          <SelectedImportMetric key={flag.label} label={flag.label} value={flag.value} />
        ))}
      </div>

      <dl className="action-field-list">
        <SelectedImportField label="draft_id" value={draft.draftId} />
        <SelectedImportField label="draft_state" value={draft.state} />
        <SelectedImportField label="import_state" value={draft.sourceSummary.importState} />
        <SelectedImportField label="accepted_files" value={String(draft.sourceSummary.acceptedFiles)} />
        <SelectedImportField label="blocked_files" value={String(draft.sourceSummary.blockedFiles)} />
        <SelectedImportField label="warning_count" value={String(draft.sourceSummary.warningCount)} />
        <SelectedImportField label="next_recommendation" value={draft.nextRecommendation} />
      </dl>

      <div className="draft-structure-grid" aria-label="instruction draft safety notes">
        <section className="draft-structure-block">
          <span className="action-panel-label">Safety notes / 安全说明</span>
          <h3>draft_only=true</h3>
          <ul>
            {draft.taintNotes.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
        </section>

        <section className="draft-structure-block">
          <span className="action-panel-label">Downgrade reasons / 降级原因</span>
          <h3>{draft.downgradeReasons.length > 0 ? 'needs_review_or_blocked' : 'ready_without_extra_warning'}</h3>
          <ul>
            {draft.downgradeReasons.length > 0 ? (
              draft.downgradeReasons.map((reason) => <li key={reason}>{reason}</li>)
            ) : (
              <li>No unsafe, missing, duplicate, stale, unverifiable, or blocked warning signal was detected.</li>
            )}
          </ul>
        </section>
      </div>

      <div className="draft-structure-grid" aria-label="generated instruction draft fields">
        {draft.sections.map((section) => (
          <section className="draft-structure-block" key={section.sectionId}>
            <h3>{section.label}</h3>
            <ul>
              {section.lines.map((line, index) => (
                <li key={`${section.sectionId}-${index}-${line.slice(0, 50)}`}>{line}</li>
              ))}
            </ul>
          </section>
        ))}
      </div>

      <label className="draft-textarea-label" htmlFor="selected-file-instruction-draft">
        可复制短指令草案 / copyable short Codex instruction draft
      </label>
      <textarea
        aria-label="copyable short Codex instruction draft"
        id="selected-file-instruction-draft"
        readOnly
        value={draft.plainTextDraft}
      />
    </section>
  );
}

function SelectedImportMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="import-metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function SelectedImportField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
