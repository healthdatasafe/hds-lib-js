import { assert } from './test-utils/deps-node.js';
import { appTemplates } from '../ts/index.ts';

const { Contact, LEGACY_CHAT_TYPE, legacyChatStreams, legacyChatSource, legacyChatMessages } = appTemplates;

// As on demo testuser56 ↔ drandy: what the person wrote in `chat-drandy`, the doctor's reply in `chat-drandy-in`
// (a child stream of the first); the content is the text itself
const legacy = (id, time, streamId, content = 'msg ' + id, extra = {}) =>
  ({ id, time, type: LEGACY_CHAT_TYPE, streamIds: [streamId], content, ...extra });

const events = [
  legacy('w', 300, 'chat-drandy', 'Wednesday'),
  legacy('p', 200, 'chat-drandy-in', 'perfect'),
  legacy('h', 100, 'chat-drandy', 'hello')
];

describe('[LGCX] pre-CMC chat (legacyChat)', () => {
  it('[LGC1] the type is message/hds-chat-v1', () => {
    assert.equal(LEGACY_CHAT_TYPE, 'message/hds-chat-v1');
  });

  it('[LGC2] names the contact\'s two streams after its account name', () => {
    assert.deepEqual(legacyChatStreams('drandy'), { outgoing: 'chat-drandy', incoming: 'chat-drandy-in' });
  });

  it('[LGC3] no streams without an account name (a bridge or service access)', () => {
    assert.equal(legacyChatStreams(null), null);
    assert.equal(legacyChatStreams(undefined), null);
    assert.equal(legacyChatStreams(''), null);
  });

  it('[LGC4] the stream gives the direction: chat-<x> mine, chat-<x>-in the contact\'s', () => {
    assert.equal(legacyChatSource(events[2], 'drandy'), 'me');
    assert.equal(legacyChatSource(events[1], 'drandy'), 'contact');
  });

  it('[LGC5] another contact\'s streams, another type, no account name: unknown', () => {
    assert.equal(legacyChatSource(legacy('x', 1, 'chat-drbobby'), 'drandy'), 'unknown');
    assert.equal(legacyChatSource({ ...legacy('x', 1, 'chat-drandy'), type: 'note/txt' }, 'drandy'), 'unknown');
    assert.equal(legacyChatSource({ ...legacy('x', 1, 'chat-drandy'), streamIds: undefined }, 'drandy'), 'unknown');
    assert.equal(legacyChatSource(legacy('x', 1, 'chat-drandy'), null), 'unknown');
    // a CMC chat event is not a legacy one
    assert.equal(legacyChatSource({ id: 'c', time: 1, type: 'message/chat-cmc', streamIds: ['chat-drandy'], content: {} }, 'drandy'), 'unknown');
  });

  it('[LGC6] an event in both streams is the contact\'s (the incoming stream is a child of the outgoing one)', () => {
    assert.equal(legacyChatSource({ ...legacy('x', 1, 'chat-drandy'), streamIds: ['chat-drandy', 'chat-drandy-in'] }, 'drandy'), 'contact');
  });

  it('[LGC7] lists the contact\'s messages oldest first, each with its direction', () => {
    assert.deepEqual(legacyChatMessages('drandy', events), [
      { id: 'h', text: 'hello', time: 100, fromContact: false },
      { id: 'p', text: 'perfect', time: 200, fromContact: true },
      { id: 'w', text: 'Wednesday', time: 300, fromContact: false }
    ]);
  });

  it('[LGC8] leaves out trashed, empty, non-text and other contacts\' messages; trims the text', () => {
    const more = [
      ...events,
      legacy('t', 400, 'chat-drandy', 'gone', { trashed: true }),
      legacy('e', 500, 'chat-drandy-in', '   '),
      legacy('o', 600, 'chat-drandy', { content: 'object' }),
      legacy('b', 700, 'chat-drbobby', 'not drandy'),
      legacy('s', 800, 'chat-drandy-in', '  see you  ')
    ];
    const messages = legacyChatMessages('drandy', more);
    assert.deepEqual(messages.map(m => m.id), ['h', 'p', 'w', 's']);
    assert.equal(messages[3].text, 'see you');
  });

  it('[LGC9] only reads: the events are left as they are', () => {
    const before = JSON.stringify(events);
    legacyChatMessages('drandy', events);
    assert.equal(JSON.stringify(events), before);
  });

  it('[LGCA] Contact: legacyChatStreams, legacyChatSource, legacyChatMessages use its remoteUsername', () => {
    const contact = new Contact('drandy', 'Dr Andy');
    assert.deepEqual(contact.legacyChatStreams, { outgoing: 'chat-drandy', incoming: 'chat-drandy-in' });
    assert.equal(contact.legacyChatSource(events[1]), 'contact');
    assert.deepEqual(contact.legacyChatMessages(events).map(m => m.id), ['h', 'p', 'w']);
    // chatEventInfos (CMC streams) is unchanged: a legacy event is not a CMC one
    assert.deepEqual(contact.chatEventInfos(events[1]), { source: 'unknown' });
  });

  it('[LGCB] Contact without account name has no legacy chat', () => {
    const bridge = new Contact(null, 'Mira');
    assert.equal(bridge.legacyChatStreams, null);
    assert.equal(bridge.legacyChatSource(events[1]), 'unknown');
    assert.deepEqual(bridge.legacyChatMessages(events), []);
  });
});
