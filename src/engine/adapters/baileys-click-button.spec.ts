import type { WASocket } from '@whiskeysockets/baileys';
import { BadRequestException } from '@nestjs/common';
import { BaileysMessaging, type BaileysMessagingHost } from './baileys-messaging';
import { MessageNotFoundError } from '../../common/errors/message-not-found.error';
import { createLogger } from '../../common/services/logger.service';

const logger = createLogger('baileys-click-button.spec');

const PROMPT = {
  key: { id: 'PROMPT-1', remoteJid: '628111@s.whatsapp.net', fromMe: false },
  message: {
    buttonsMessage: {
      contentText: 'Já é nosso cliente?',
      buttons: [
        { buttonId: 'yes', buttonText: { displayText: 'Sim' } },
        { buttonId: 'no', buttonText: { displayText: 'Não' } },
      ],
    },
  },
};

function makeMessaging(stored: unknown = PROMPT) {
  const relayMessage = jest.fn().mockResolvedValue(undefined);
  const sock = { relayMessage, sendMessage: jest.fn() };
  const getStoredMessage = jest.fn().mockResolvedValue(stored);
  const putStoredMessage = jest.fn();
  const generateWAMessageFromContent = jest.fn().mockReturnValue({
    key: { id: 'CLICK-1', remoteJid: '628111@s.whatsapp.net' },
    message: { templateButtonReplyMessage: { selectedId: 'yes' } },
    messageTimestamp: 1700000000,
  });
  const host = {
    ensureReady: jest.fn(),
    sessionProxyUrl: () => undefined,
    getSocket: () => sock as unknown as WASocket,
    logger,
    toNeutralJid: (j: string) => j.replace('@c.us', '@s.whatsapp.net'),
    toEngineJid: (j: string) => j,
    normalizedSelfJid: () => '628177@s.whatsapp.net',
    getEphemeralExpiration: () => undefined,
    toUnixSeconds: (ts: number | { toNumber(): number } | null | undefined) =>
      typeof ts === 'number' ? ts : ts && 'toNumber' in ts ? ts.toNumber() : 0,
    loadLib: () =>
      Promise.resolve({
        normalizeMessageContent: (c: unknown) => c,
        getContentType: () => 'buttonsMessage',
        generateWAMessageFromContent,
      } as never),
    getStoredMessage,
    putStoredMessage,
    recordLidMapping: () => undefined,
    getOnMessageCreate: () => undefined,
    mapMessage: () => Promise.resolve({} as never),
  } as unknown as BaileysMessagingHost;
  return {
    messaging: new BaileysMessaging(host),
    relayMessage,
    generateWAMessageFromContent,
    getStoredMessage,
    putStoredMessage,
  };
}

describe('BaileysMessaging.clickButton', () => {
  it('relays a response proto quoted to the stored prompt', async () => {
    const { messaging, relayMessage, generateWAMessageFromContent, putStoredMessage } = makeMessaging();
    const result = await messaging.clickButton('628111@s.whatsapp.net', 'PROMPT-1', 'yes', 'Sim');
    expect(generateWAMessageFromContent).toHaveBeenCalledWith(
      '628111@s.whatsapp.net',
      {
        buttonsResponseMessage: {
          selectedButtonId: 'yes',
          selectedDisplayText: 'Sim',
          type: 1,
        },
      },
      expect.objectContaining({ quoted: PROMPT }),
    );
    expect(relayMessage).toHaveBeenCalledWith(
      '628111@s.whatsapp.net',
      { templateButtonReplyMessage: { selectedId: 'yes' } },
      { messageId: 'CLICK-1' },
    );
    expect(putStoredMessage).toHaveBeenCalled();
    expect(result).toEqual({ id: 'CLICK-1', timestamp: 1700000000 });
  });

  it('404s when the prompt is not in the store', async () => {
    const { messaging } = makeMessaging(null);
    await expect(messaging.clickButton('628111@s.whatsapp.net', 'MISSING', 'yes')).rejects.toBeInstanceOf(
      MessageNotFoundError,
    );
  });

  it('400s when buttonId is not among the prompt choices', async () => {
    const { messaging } = makeMessaging();
    await expect(messaging.clickButton('628111@s.whatsapp.net', 'PROMPT-1', 'maybe')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});
