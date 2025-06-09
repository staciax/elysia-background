import { Elysia, t } from 'elysia';
import { background } from '../src/index';

async function sendEmail(email: string, message: string): Promise<void> {
  console.log(`Sending email to: ${email}`);
  console.log(`Message: ${message}`);

  // simulate email sending
  await Bun.sleep(2000);

  console.log(`Email sent successfully to ${email}`);
}

async function logActivity(action: string, userEmail: string): Promise<void> {
  console.log(`Logging activity: ${action} for ${userEmail}`);

  // simulate logging activity
  await Bun.sleep(1000);

  console.log(`Activity logged: ${action}`);
}

const app = new Elysia().use(background()).post(
  '/register',
  ({ backgroundTasks, body }) => {
    const { email, name } = body;

    backgroundTasks.addTask(
      sendEmail,
      email,
      `Dear ${name}, thank you for registering with us.`,
    );
    backgroundTasks.addTask(logActivity, 'user_registered', email);

    // Send response immediately (don't wait for background tasks)
    return {
      message:
        `Thank you, ${name}. Your registration has been processed successfully. ` +
        `A confirmation email will be sent to ${email} shortly.`,
    };
  },
  {
    body: t.Object({
      email: t.String({ format: 'email' }),
      name: t.String(),
    }),
  },
);

app.listen(3001, ({ hostname, port }) => {
  console.log(`🦊 Elysia is running at http://${hostname}:${port}`);
});
