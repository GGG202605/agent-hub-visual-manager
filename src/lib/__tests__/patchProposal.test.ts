import { describe, expect, it } from 'vitest';
import { parsePatchProposalJson } from '../patchProposal';

const proposal = {
  version: '1.0.0',
  proposalId: 'proposal-json-1',
  runId: 'run-json-1',
  agentId: 'AG-DEV',
  title: 'Update example',
  createdAt: '2099-01-01T00:00:00.000Z',
  files: [
    {
      path: 'src/example.ts',
      beforeSha256: 'a'.repeat(64),
      afterSha256: 'b'.repeat(64),
      addedLines: 1,
      removedLines: 1,
      patch: '--- a/src/example.ts\n+++ b/src/example.ts\n@@ -1 +1 @@\n-old\n+new\n',
    },
  ],
};

describe('parsePatchProposalJson', () => {
  it('accepts one complete JSON object and preserves the server proposal contract', () => {
    expect(parsePatchProposalJson(JSON.stringify(proposal))).toEqual(proposal);
  });

  it('rejects fenced, prefixed, malformed and incomplete model output', () => {
    expect(parsePatchProposalJson(`\`\`\`json\n${JSON.stringify(proposal)}\n\`\`\``)).toBeNull();
    expect(parsePatchProposalJson(`提案：${JSON.stringify(proposal)}`)).toBeNull();
    expect(parsePatchProposalJson('{bad json}')).toBeNull();
    expect(parsePatchProposalJson(JSON.stringify({ ...proposal, files: [] }))).toBeNull();
  });
});
