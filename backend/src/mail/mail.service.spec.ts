import { jest } from '@jest/globals';
import { ConfigService } from '@nestjs/config';
import { MailService } from './mail.service';

// nodemailer is imported as a namespace, which Jest's ESM mode cannot mock, so
// the real transporter is built (that opens no connection) and then swapped
// for a stub. What these cannot show: a real SMTP conversation. That is
// covered by hand with Mailpit (npm run mail:test).

type AsyncFn = (...args: unknown[]) => Promise<unknown>;

function makeService(overrides: Record<string, unknown> = {}) {
  const values: Record<string, unknown> = {
    MAIL_FROM: 'DevCommunity <no-reply@devcommunity.local>',
    MAIL_FAILURE_RATE: 0,
    MAIL_DELAY_MS: 0,
    SMTP_HOST: 'localhost',
    SMTP_PORT: 1026,
    ...overrides,
  };
  const config = {
    getOrThrow: (key: string) => values[key],
  } as unknown as ConfigService;
  const service = new MailService(config);
  const sendMail = jest.fn<AsyncFn>().mockResolvedValue({ messageId: 'm1' });
  (service as unknown as { transporter: unknown }).transporter = { sendMail };
  return { service, sendMail };
}

describe('MailService', () => {
  it('sends a plain-text welcome email from MAIL_FROM to the user', async () => {
    const { service, sendMail } = makeService();

    await service.sendWelcome('ada@x.test', 'Ada Lovelace');

    expect(sendMail).toHaveBeenCalledTimes(1);
    const message = sendMail.mock.calls[0][0] as Record<string, unknown>;
    expect(message).toMatchObject({
      from: 'DevCommunity <no-reply@devcommunity.local>',
      to: 'ada@x.test',
      subject: 'Welcome to DevCommunity!',
    });
    expect(message.text).toContain('Hi Ada Lovelace,');
    // Plain text only, so a hostile fullName cannot inject HTML.
    expect(message).not.toHaveProperty('html');
  });

  it('passes an SMTP failure on to the caller', async () => {
    const { service, sendMail } = makeService();
    sendMail.mockRejectedValue(new Error('ECONNREFUSED'));

    await expect(service.sendWelcome('ada@x.test', 'Ada')).rejects.toThrow(
      'ECONNREFUSED',
    );
  });

  it('with MAIL_FAILURE_RATE=1 fails every send without calling SMTP', async () => {
    const { service, sendMail } = makeService({ MAIL_FAILURE_RATE: 1 });

    await expect(service.sendWelcome('ada@x.test', 'Ada')).rejects.toThrow(
      'Simulated SMTP failure',
    );
    expect(sendMail).not.toHaveBeenCalled();
  });

  it('with MAIL_DELAY_MS set waits that long before sending', async () => {
    const { service, sendMail } = makeService({ MAIL_DELAY_MS: 60 });

    const started = performance.now();
    await service.sendWelcome('ada@x.test', 'Ada');

    // A little under 60, because timers can fire a millisecond early.
    expect(performance.now() - started).toBeGreaterThanOrEqual(55);
    expect(sendMail).toHaveBeenCalledTimes(1);
  });
});
