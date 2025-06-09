import { Elysia } from 'elysia';
import { background } from '../src/index';

// Note: Even though the plugin instance is shared, each request gets its own
// BackgroundTasks instance via Elysia's derive() - tasks are NOT shared between requests

// src/lib/background.ts

export const bg = background({
  onError: (error) => {
    console.error('[elysia-background] Task error:', error);
  },
});

// src/instance-1.ts

const task1 = async (name: string) => {
  console.log(`Task 1 executed for ${name}`);
};

export const app1 = new Elysia()
  .use(bg) // Use the shared background plugin
  .get('/task1', ({ backgroundTasks }) => {
    backgroundTasks.addTask(task1, 'test');
    return 'Task 1 initiated';
  });

// src/instance-2.ts

const task2 = async (name: string) => {
  console.log(`Task 2 executed for ${name}`);
};

export const app2 = new Elysia()
  .use(bg) // Use the shared background plugin
  .get('/task2', ({ backgroundTasks }) => {
    backgroundTasks.addTask(task2, 'test');
    return 'Task 2 initiated';
  });

// src/index.ts

const app = new Elysia() //
  .use(app1)
  .use(app2);

app.listen(3002, ({ hostname, port }) => {
  console.log(`🦊 Elysia is running at http://${hostname}:${port}`);
});
