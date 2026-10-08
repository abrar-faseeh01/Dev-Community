import { Queue, QueueEvents } from 'bullmq';
import 'dotenv/config';
import mongoose from 'mongoose';
import { validateEnv } from '../src/config/env.validation';
import {
  MAIL_QUEUE,
  WELCOME_JOB,
  welcomeJobOptions,
} from '../src/mail/mail.constants';
import { User, UserSchema } from '../src/users/schemas/user.schema';

// Adds ONE welcome job by hand and waits for the worker to finish it.
// The API must already be running (npm run start:dev): the worker lives in it.
// A throwaway user is created for the job and removed again at the end.
async function main() {
  const env = validateEnv(process.env);
  const connection = { host: env.REDIS_HOST, port: env.REDIS_PORT };

  await mongoose.connect(env.MONGODB_URI);
  const UserModel = mongoose.model(User.name, UserSchema);
  const user = await UserModel.create({
    fullName: 'Queue Test',
    email: `queue-test-${Date.now()}@example.com`,
    passwordHash: 'not-a-real-hash', // this user can never log in
  });

  const queue = new Queue(MAIL_QUEUE, { connection });
  const events = new QueueEvents(MAIL_QUEUE, { connection });
  await events.waitUntilReady();

  try {
    const id = String(user._id);
    const job = await queue.add(
      WELCOME_JOB,
      { userId: id },
      welcomeJobOptions(id),
    );
    console.log(`Job ${job.id} added. Waiting for the worker...`);

    await job.waitUntilFinished(events, 30_000);

    const sentAt = (await UserModel.findById(user._id))?.welcomeEmailSentAt;
    console.log(`Done. welcomeEmailSentAt = ${sentAt?.toISOString()}`);
    console.log('Check Mailpit: http://localhost:8025');
  } finally {
    await UserModel.deleteOne({ _id: user._id });
    await events.close();
    await queue.close();
    await mongoose.disconnect();
  }
}

main().catch((err) => {
  console.error('Failed:', err);
  process.exit(1);
});
