import { describe, expect, it } from 'bun:test';

import { Elysia } from 'elysia';

import { background } from '../src/index';
import { get, sleep } from './utils';

describe('BackgroundTasks', () => {
  it('should execute async task successfully', async () => {
    let TASK_COMPLETE = false;

    const async_task = async () => {
      TASK_COMPLETE = true;
    };

    const app = new Elysia()
      .use(background())
      .get('/', ({ backgroundTasks }) => {
        backgroundTasks.addTask(async_task);
        return 'task initiated';
      });

    const response = await app.handle(get('/'));
    expect(response.status).toBe(200);

    const text = await response.text();

    expect(text).toBe('task initiated');
    expect(TASK_COMPLETE).toBe(true);
  });
  // NOTE: currently, sync tasks are not supported
  // it('should execute sync task successfully', async () => {
  //     let TASK_COMPLETE = false;

  //     const sync_task = () => {
  //         TASK_COMPLETE = true;
  //     };

  //     const app = new Elysia()
  //         .use(BackgroundTasksPlugin)
  //         .get('/', ({ backgroundTasks }) => {
  //             backgroundTasks.addTask(sync_task);
  //             return 'task initiated';
  //         });

  //     const response = await app.handle(get('/'));

  //     expect(response.status).toBe(200);
  //     const text = await response.text();

  //     expect(text).toBe('task initiated');
  //     expect(TASK_COMPLETE).toBe(true);
  // });

  it('should execute multiple tasks', async () => {
    let TASK_COUNTER = 0;

    // NOTE: currently, sync tasks are not supported
    const increment = async (amount: number) => {
      TASK_COUNTER += amount;
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
    const text = await response.text();

    expect(text).toBe('task initiated');

    await sleep(100);

    expect(TASK_COUNTER).toBe(1 + 2 + 3);
  });
  it('should stop execution when task fails', async () => {
    let TASK_COUNTER = 0;

    const increment = async () => {
      TASK_COUNTER += 1;
      if (TASK_COUNTER === 1) {
        throw new Error('task failed');
      }
    };

    const app = new Elysia()
      .use(
        background({
          // just supress the error for testing
          onError: () => {},
        }),
      )
      .get('/', ({ backgroundTasks }) => {
        backgroundTasks.addTask(increment);
        backgroundTasks.addTask(increment);
        return 'task initiated';
      });

    const response = await app.handle(get('/'));

    expect(response.status).toBe(200);
    const text = await response.text();

    expect(text).toBe('task initiated');

    await sleep(100);

    expect(TASK_COUNTER).toBe(1);
  });

  it('should support synchronous error handlers', async () => {
    let capturedError: unknown;

    const app = new Elysia()
      .use(
        background({
          onError: (error) => {
            capturedError = error;
          },
        }),
      )
      .get('/error', ({ backgroundTasks }) => {
        backgroundTasks.addTask(async () => {
          throw new Error('Test sync error');
        });
        return 'task initiated';
      });

    await app.handle(get('/error'));

    await sleep(100);

    expect(capturedError).toBeInstanceOf(Error);
    expect((capturedError as Error).message).toBe('Test sync error');
  });

  it('should support asynchronous error handlers without blocking', async () => {
    let capturedError: unknown;
    let errorHandlerCompleted = false;

    const app = new Elysia()
      .use(
        background({
          onError: async (error) => {
            capturedError = error;
            await sleep(100);
            errorHandlerCompleted = true;
          },
        }),
      )
      .get('/error', ({ backgroundTasks }) => {
        backgroundTasks.addTask(async () => {
          throw new Error('Test async error handler');
        });
        return 'task initiated';
      });

    await app.handle(get('/error'));

    await sleep(200);

    expect(capturedError).toBeInstanceOf(Error);
    expect((capturedError as Error).message).toBe('Test async error handler');
    expect(errorHandlerCompleted).toBe(true);
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
          throw new Error('String error');
        });
        return 'task initiated';
      });

    await app.handle(get('/'));

    await sleep(100);

    expect(capturedError).toBeInstanceOf(Error);
  });

  it('should not block subsequent requests when error handler takes time', async () => {
    const requestTimes: number[] = [];
    let asyncErrorHandlerStarted = false;
    let asyncErrorHandlerCompleted = false;

    const app = new Elysia()
      .use(
        background({
          onError: async (_error) => {
            asyncErrorHandlerStarted = true;
            await sleep(5000);
            asyncErrorHandlerCompleted = true;
          },
        }),
      )
      .get('/slow-error', ({ backgroundTasks }) => {
        backgroundTasks.addTask(async () => {
          throw new Error('Slow error handler test');
        });
        return 'slow error task initiated';
      })
      .get('/fast', () => {
        return 'fast response';
      });

    const startTime1 = Date.now();
    await app.handle(get('/slow-error'));
    requestTimes.push(Date.now() - startTime1);

    await sleep(100);

    expect(asyncErrorHandlerStarted).toBe(true);
    expect(asyncErrorHandlerCompleted).toBe(false);

    const startTime2 = Date.now();
    await app.handle(get('/fast'));
    const secondRequestTime = Date.now() - startTime2;
    requestTimes.push(secondRequestTime);

    expect(secondRequestTime).toBeLessThan(1000);

    const totalTime = requestTimes.reduce((sum, time) => sum + time, 0);
    expect(totalTime).toBeLessThan(1000);
  });
});
