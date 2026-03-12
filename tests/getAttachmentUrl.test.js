import { assert } from './test-utils/deps-node.js';
import { getAttachmentUrl } from '../ts/toolkit/getAttachmentUrl.ts';

describe('[GAU] getAttachmentUrl', function () {
  const fakeConnection = {
    endpoint: 'https://demo.datasafe.dev/testuser/',
    apiEndpoint: 'https://token123@demo.datasafe.dev/testuser/',
    token: 'token123'
  };

  const eventWithAttachment = {
    id: 'evt123',
    attachments: [
      { id: 'att-001', fileName: 'photo.jpg', readToken: 'rt-abc-123' },
      { id: 'att-002', fileName: 'thumb.jpg', readToken: 'rt-def-456' }
    ]
  };

  it('[GAU1] builds URL with readToken from first attachment', function () {
    const url = getAttachmentUrl(fakeConnection, eventWithAttachment);
    assert.strictEqual(
      url,
      'https://demo.datasafe.dev/testuser/events/evt123/att-001?readToken=rt-abc-123'
    );
  });

  it('[GAU2] builds URL for specific attachment index', function () {
    const url = getAttachmentUrl(fakeConnection, eventWithAttachment, 1);
    assert.strictEqual(
      url,
      'https://demo.datasafe.dev/testuser/events/evt123/att-002?readToken=rt-def-456'
    );
  });

  it('[GAU3] returns null when no attachments', function () {
    const url = getAttachmentUrl(fakeConnection, { id: 'evt456' });
    assert.strictEqual(url, null);
  });

  it('[GAU4] returns null for out-of-range index', function () {
    const url = getAttachmentUrl(fakeConnection, eventWithAttachment, 5);
    assert.strictEqual(url, null);
  });

  it('[GAU5] strips trailing slash from endpoint', function () {
    const url = getAttachmentUrl(fakeConnection, eventWithAttachment);
    assert.ok(!url.includes('//events'), 'Should not have double slash before events');
  });

  it('[GAU6] uses connection.endpoint (no embedded credentials)', function () {
    const url = getAttachmentUrl(fakeConnection, eventWithAttachment);
    assert.ok(!url.includes('@'), 'URL should not contain embedded credentials');
    assert.ok(!url.includes('auth='), 'URL should use readToken, not auth');
    assert.ok(url.includes('readToken='), 'URL should contain readToken');
  });
});
