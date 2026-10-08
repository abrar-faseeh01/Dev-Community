import { ConfigService } from '@nestjs/config';
import 'dotenv/config';
import { validateEnv } from '../src/config/env.validation';
import { MailService } from '../src/mail/mail.service';

// One-off check that MailService can reach the SMTP server (Mailpit locally).
// No Nest app, no database, no queue: just env validation + one email.
async function main() {
  const config = new ConfigService(validateEnv(process.env));
  const mail = new MailService(config);

  await mail.sendWelcome('test@example.com', 'Test User');
  console.log('Sent. Open Mailpit (http://localhost:8025) to see it.');
}

main().catch((err) => {
  console.error('Failed to send:', err);
  process.exit(1);
});
