import { BaileysStatus, type BaileysStatusHost } from './baileys-status';
import type { WASocket } from '@whiskeysockets/baileys';

/**
 * A status post and a status revoke both go through `sock.sendMessage` directly rather than the
 * messaging delegate's chokepoint, so each has to record its own id. Without that, the library's
 * `append` echo of the post is not recognised as this session's and is reported as an inbound
 * message; nothing else in the suite covered either call.
 */
function makeStatus(sendMessage: jest.Mock): { status: BaileysStatus; remembered: string[] } {
  const remembered: string[] = [];
  const host = {
    ensureReady: () => undefined,
    getSocket: () => ({ sendMessage }) as unknown as WASocket,
    toEngineJid: (jid: string) => jid,
    normalizedSelfJid: () => '628999@s.whatsapp.net',
    toUnixSeconds: () => 1700000000,
    rememberOwnSend: (id: string | null | undefined) => {
      if (id) remembered.push(id);
    },
  } as unknown as BaileysStatusHost;
  return { status: new BaileysStatus(host), remembered };
}

describe('BaileysStatus records the ids of the statuses this session sends', () => {
  it('remembers the id of a posted status', async () => {
    const sendMessage = jest.fn().mockResolvedValue({ key: { id: 'STATUS-1' }, messageTimestamp: 1700000000 });
    const { status, remembered } = makeStatus(sendMessage);

    await status.postTextStatus('hello', { recipients: ['628111@s.whatsapp.net'] });

    expect(remembered).toEqual(['STATUS-1']);
  });

  it('remembers the id of a status revoke', async () => {
    const sendMessage = jest.fn().mockResolvedValue({ key: { id: 'REVOKE-1' } });
    const { status, remembered } = makeStatus(sendMessage);

    await status.deleteStatus('STATUS-1');

    expect(remembered).toEqual(['REVOKE-1']);
  });

  it('records nothing when the send echoes no id back', async () => {
    const sendMessage = jest.fn().mockResolvedValue(undefined);
    const { status, remembered } = makeStatus(sendMessage);

    await status.deleteStatus('STATUS-1');

    expect(remembered).toEqual([]);
  });
});
