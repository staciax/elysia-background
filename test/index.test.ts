import { describe, expect, it } from 'bun:test';

import { Elysia } from 'elysia';

import { background } from '../src/index';
import { get, sleep } from './utils';

describe('BackgroundTasks', () => {
  it('should execute async task successfully', async () => {
    let taskComplete = false;

    const asyncTask = async () => {
      taskComplete = true;
    };

    const app = new Elysia()
      .use(background())
      .get('/', ({ backgroundTasks }) => {
        backgroundTasks.addTask(asyncTask);
        return 'task initiated';
      });

    const response = await app.handle(get('/'));
    expect(response.status).toBe(200);
    expect(await response.text()).toBe('task initiated');
    expect(taskComplete).toBe(true);
  });

  // NOTE: currently, sync tasks are not supported
  // it('should execute sync task successfully', async () => {
  //     let taskComplete = false;
  //
  //     const syncTask = () => {
  //         taskComplete = true;
  //     };
  //
  //     const app = new Elysia()
  //         .use(background())
  //         .get('/', ({ backgroundTasks }) => {
  //             backgroundTasks.addTask(syncTask);
  //             return 'task initiated';
  //         });
  //
  //     const response = await app.handle(get('/'));
  //     expect(response.status).toBe(200);
  //     expect(await response.text()).toBe('task initiated');
  //     expect(taskComplete).toBe(true);
  // });

  it('should execute multiple tasks successfully', async () => {
    let taskCounter = 0;

    const increment = async (amount: number) => {
      taskCounter += amount;
    };

    const app = new Elysia()
      .use(background())
      .get('/', ({ backgroundTasks }) => {
        backgroundTasks.addTask(increment, 1);
        backgroundTasks.addTask(increment, 2);
        backgroundTasks.addTask(increment, 3);
        return 'task initiated';
      });

    const response = await app.handle(get('/'));
    expect(response.status).toBe(200);
    expect(await response.text()).toBe('task initiated');

    await sleep(100);
    expect(taskCounter).toBe(1 + 2 + 3);
  });

  it('should stop execution when task fails', async () => {
    let taskCounter = 0;

    const increment = async () => {
      taskCounter += 1;
      if (taskCounter === 1) {
        throw new Error('task failed');
      }
    };

    const app = new Elysia()
      .use(
        background({
          onError: () => {}, // suppress error for testing
        }),
      )
      .get('/', ({ backgroundTasks }) => {
        backgroundTasks.addTask(increment);
        backgroundTasks.addTask(increment);
        return 'task initiated';
      });

    const response = await app.handle(get('/'));
    expect(response.status).toBe(200);
    expect(await response.text()).toBe('task initiated');

    await sleep(100);
    expect(taskCounter).toBe(1);
  });

  it('should handle synchronous error handlers', async () => {
    let capturedError: unknown;

    const app = new Elysia()
      .use(
        background({
          onError: (error) => {
            capturedError = error;
          },
        }),
      )
      .get('/', ({ backgroundTasks }) => {
        backgroundTasks.addTask(async () => {
          throw new Error('Test sync error');
        });
        return 'task initiated';
      });

    const response = await app.handle(get('/'));
    expect(response.status).toBe(200);
    expect(await response.text()).toBe('task initiated');

    await sleep(100);
    expect(capturedError).toBeInstanceOf(Error);
    expect((capturedError as Error).message).toBe('Test sync error');
  });

  it('should handle asynchronous error handlers', async () => {
    let capturedError: unknown;
    let errorHandlerComplete = false;

    const app = new Elysia()
      .use(
        background({
          onError: async (error) => {
            capturedError = error;
            await sleep(100);
            errorHandlerComplete = true;
          },
        }),
      )
      .get('/', ({ backgroundTasks }) => {
        backgroundTasks.addTask(async () => {
          throw new Error('Test async error');
        });
        return 'task initiated';
      });

    const response = await app.handle(get('/'));
    expect(response.status).toBe(200);
    expect(await response.text()).toBe('task initiated');

    await sleep(200);
    expect(capturedError).toBeInstanceOf(Error);
    expect((capturedError as Error).message).toBe('Test async error');
    expect(errorHandlerComplete).toBe(true);
  });

  it('should handle unknown error types', async () => {
    let capturedError: unknown;

    const app = new Elysia()
      .use(
        background({
          onError: (error) => {
            capturedError = error;
          },
        }),
      )
      .get('/', ({ backgroundTasks }) => {
        backgroundTasks.addTask(async () => {
          throw new Error('Unknown error');
        });
        return 'task initiated';
      });

    const response = await app.handle(get('/'));
    expect(response.status).toBe(200);
    expect(await response.text()).toBe('task initiated');

    await sleep(100);
    expect(capturedError).toBeInstanceOf(Error);
  });

  it('should not block subsequent requests when error handler takes time', async () => {
    let errorHandlerStarted = false;
    let errorHandlerComplete = false;

    const app = new Elysia()
      .use(
        background({
          onError: async (_error) => {
            errorHandlerStarted = true;
            await sleep(5000);
            errorHandlerComplete = true;
          },
        }),
      )
      .get('/slow', ({ backgroundTasks }) => {
        backgroundTasks.addTask(async () => {
          throw new Error('Slow error handler test');
        });
        return 'slow task initiated';
      })
      .get('/quick', () => {
        return 'quick response';
      });

    const firstResponse = await app.handle(get('/slow'));
    expect(firstResponse.status).toBe(200);
    expect(await firstResponse.text()).toBe('slow task initiated');

    await sleep(50);
    expect(errorHandlerStarted).toBe(true);
    expect(errorHandlerComplete).toBe(false);

    const startTime = Date.now();
    const secondResponse = await app.handle(get('/quick'));
    const requestTime = Date.now() - startTime;

    expect(secondResponse.status).toBe(200);
    expect(await secondResponse.text()).toBe('quick response');
    expect(requestTime).toBeLessThan(100);
    expect(errorHandlerComplete).toBe(false);
  });

  it('should not block subsequent requests when task takes time', async () => {
    let taskStarted = false;
    let taskComplete = false;

    const app = new Elysia()
      .use(background())
      .get('/slow', ({ backgroundTasks }) => {
        backgroundTasks.addTask(async () => {
          taskStarted = true;
          await sleep(5000);
          taskComplete = true;
        });
        return 'slow task initiated';
      })
      .get('/quick', () => {
        return 'quick response';
      });

    const firstResponse = await app.handle(get('/slow'));
    expect(firstResponse.status).toBe(200);
    expect(await firstResponse.text()).toBe('slow task initiated');

    await sleep(50);
    expect(taskStarted).toBe(true);
    expect(taskComplete).toBe(false);

    const startTime = Date.now();
    const secondResponse = await app.handle(get('/quick'));
    const requestTime = Date.now() - startTime;

    expect(secondResponse.status).toBe(200);
    expect(await secondResponse.text()).toBe('quick response');
    expect(requestTime).toBeLessThan(100);
    expect(taskComplete).toBe(false);
  });
});
