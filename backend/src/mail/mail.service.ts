import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// The only place that knows about SMTP. Everything else asks this class to
// "send a welcome email" and never touches nodemailer directly.
@Injectable()
export class MailService {
  private readonly transporter: nodemailer.Transporter;
  private readonly from: string;
  private readonly failureRate: number;
  private readonly delayMs: number;

  constructor(config: ConfigService) {
    this.from = config.getOrThrow<string>('MAIL_FROM');
    this.failureRate = config.getOrThrow<number>('MAIL_FAILURE_RATE');
    this.delayMs = config.getOrThrow<number>('MAIL_DELAY_MS');
    this.transporter = nodemailer.createTransport({
      host: config.getOrThrow<string>('SMTP_HOST'),
      port: config.getOrThrow<number>('SMTP_PORT'),
      secure: false,
    });
  }

  async sendWelcome(to: string, fullName: string): Promise<void> {
    // Test switches: a real provider is slow and sometimes fails, Mailpit is
    // neither. Both default to 0 (off) and are refused in production.
    if (this.delayMs > 0) await sleep(this.delayMs);
    if (Math.random() < this.failureRate) {
      throw new Error('Simulated SMTP failure');
    }

    await this.transporter.sendMail({
      from: this.from,
      to,
      subject: 'Welcome to DevCommunity!',
      // Plain text only, so a hostile fullName cannot inject HTML.
      text: `Hi ${fullName},\n\nWelcome to DevCommunity. Happy building!\n`,
    });
  }
}
