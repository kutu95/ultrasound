import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parseOpenAIFileIdRefs } from './openaiFiles.js';

describe('parseOpenAIFileIdRefs', () => {
  it('parses object refs', () => {
    const refs = parseOpenAIFileIdRefs({
      openaiFileIdRefs: [
        {
          name: 'scan.jpg',
          id: 'file-abc',
          mime_type: 'image/jpeg',
          download_link: 'https://files.oaiusercontent.com/file-abc',
        },
      ],
    });
    assert.equal(refs.length, 1);
    assert.equal(refs[0].name, 'scan.jpg');
    assert.ok(refs[0].download_link?.includes('oaiusercontent.com'));
  });

  it('parses JSON string refs', () => {
    const refs = parseOpenAIFileIdRefs({
      openaiFileIdRefs: [
        JSON.stringify({
          name: 'x.png',
          download_link: 'https://files.oaiusercontent.com/x',
        }),
      ],
    });
    assert.equal(refs.length, 1);
  });

  it('returns empty when missing', () => {
    assert.deepEqual(parseOpenAIFileIdRefs({}), []);
  });
});
