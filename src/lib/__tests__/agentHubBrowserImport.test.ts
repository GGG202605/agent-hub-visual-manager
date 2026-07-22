import { describe, expect, it } from 'vitest';
import { importAgentHubFiles } from '../agentHubBrowserImport';
import { buildProjectGroundingContext } from '../agentConnectors';
import { deriveAgentFirstDashboard } from '../deriveAgentFirstDashboard';
import { createImportFiles, createMarkdownFile } from './largeProjectFixtures';

describe('browser import large-project lightweight indexes', () => {
  it('keeps records after index 8 and makes late imported facts selectable by grounding', async () => {
    const files: File[] = [
      createMarkdownFile(
        'project-state.md',
        '# Project State\n- Project ID: large-import\n- Project Name: Large Import Fixture\n- Status: active',
      ),
    ];

    for (let index = 1; index <= 12; index += 1) {
      files.push(createMarkdownFile(
        `tasks/TASK-${index}.md`,
        `# ${index === 12 ? 'late import beacon' : `Imported task ${index}`}\n- Owner: AG-ARCH\n- Status: Done`,
      ));
      files.push(createMarkdownFile(
        `runs/RUN-${index}.md`,
        `# ${index === 12 ? 'late run beacon' : `Imported run ${index}`}\n- Status: Done`,
      ));
      files.push(createMarkdownFile(
        `reviews/REVIEW-${index}.md`,
        `# ${index === 12 ? 'late review beacon' : `Imported review ${index}`}\nAG-REVIEW\nStatus: Review Ready\nHigh: 0\nMedium: 0\nLow: 1`,
      ));
      files.push(createMarkdownFile(
        `risks/risk-${index}/RISK-REGISTER.md`,
        `# ${index === 12 ? 'late risk beacon' : `Imported risk ${index}`}\nSeverity: Low\nMitigation: read only`,
      ));
    }

    const project = await importAgentHubFiles(files);
    expect(project.tasks).toHaveLength(12);
    expect(project.runs).toHaveLength(12);
    expect(project.reviews).toHaveLength(12);
    expect(project.risks).toHaveLength(12);
    expect(project.provenance).toHaveLength(files.length);
    expect(project.tasks[11]!.title).toContain('late import beacon');
    expect(project.runs[11]!.summary).toContain('late run beacon');
    expect(project.reviews[11]!.sourceRef).toBe('reviews/REVIEW-12.md');
    expect(project.risks[11]!.description).toContain('late risk beacon');
    expect(project.importStatus).toMatchObject({
      state: 'ready',
      readOnly: true,
      executionConnected: false,
    });
    expect(project.importStatus.totalBytes).toBeLessThan(2 * 1024 * 1024);

    const dashboard = deriveAgentFirstDashboard(project, 'imported');
    const grounding = buildProjectGroundingContext(project, dashboard, 'imported', {
      taskText: '请核对 late import beacon 与 late risk beacon',
      charBudget: 3_200,
      perRecordCharLimit: 180,
    });
    expect(grounding.text).toContain('[T12]');
    expect(grounding.text).toContain('late import beacon');
    expect(grounding.text).toContain('[K12]');
    expect(grounding.text).toContain('late risk beacon');
    expect(grounding.selection.candidateCount).toBeGreaterThan(48);
  });

  it('accepts exactly 400 allowlist files and fails closed at 401 before reading content', async () => {
    const atLimit = createImportFiles(400, 512 * 1024);
    const accepted = await importAgentHubFiles(atLimit);
    expect(accepted.importStatus).toMatchObject({
      state: 'ready',
      importedFiles: expect.arrayContaining(['tasks/TASK-0400.md']),
      totalBytes: 512 * 1024,
    });
    expect(accepted.importStatus.importedFiles).toHaveLength(400);

    const overLimit = createImportFiles(401, 512 * 1024);
    let reads = 0;
    for (const file of overLimit) {
      const originalText = file.text.bind(file);
      Object.defineProperty(file, 'text', {
        configurable: true,
        value: async () => {
          reads += 1;
          return originalText();
        },
      });
    }
    const blocked = await importAgentHubFiles(overLimit);
    expect(reads).toBe(0);
    expect(blocked.importStatus).toMatchObject({
      state: 'blocked',
      importedFiles: [],
      totalBytes: 0,
    });
    expect(blocked.importStatus.blockedFiles[0]?.reason).toContain('超过 400 个上限');
  });

  it('blocks generic private-data and private-knowledge-base folders before reading content', async () => {
    const files = [
      createMarkdownFile('private-data/tasks/TASK-1.md', '# Must not be read'),
      createMarkdownFile('private-knowledge-base/tasks/TASK-2.md', '# Must not be read'),
    ];
    let reads = 0;
    for (const file of files) {
      Object.defineProperty(file, 'text', {
        configurable: true,
        value: async () => {
          reads += 1;
          return 'unexpected';
        },
      });
    }

    const blocked = await importAgentHubFiles(files);

    expect(reads).toBe(0);
    expect(blocked.importStatus.state).toBe('blocked');
    expect(blocked.importStatus.blockedFiles.map((item) => item.path)).toEqual([
      'private-data/tasks/TASK-1.md',
      'private-knowledge-base/tasks/TASK-2.md',
    ]);
  });
});
