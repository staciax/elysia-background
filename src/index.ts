/**
 * Background Tasks Implementation
 * Inspired by Starlette's background task processing
 * @see https://github.com/encode/starlette/blob/master/starlette/background.py
 */

import { Elysia } from 'elysia';

/**
 * Interface for background tasks that can be executed asynchronously.
 */
export interface IBackgroundTask {
  /**
   * Executes the background task.
   *
   * @returns Promise that resolves when task completes successfully
   * @throws Error if task execution fails
   */
  run(): Promise<void>;
}

// biome-ignore lint/suspicious/noExplicitAny: Allow adding function with any arguments
const isAsyncFunction = <P extends any[]>(
  // biome-ignore lint/suspicious/noExplicitAny: Allow adding function with any return type
  func: (...args: P[]) => any,
): boolean => func.constructor.name === 'AsyncFunction';

/**
 * Function type for background tasks. Only async functions are supported.
 *
 * @template P - Parameter types for the task function
 */
// biome-ignore lint/suspicious/noExplicitAny: Allow adding function with any arguments
type TaskFunction<P extends any[]> = (...args: P) => void | Promise<void>;

/**
 * Configuration options for the background task plugin.
 *
 * @example
 * ```typescript
 * // Basic usage
 * const app = new Elysia().use(background({
 *   onError: (error) => console.error('Task failed:', error)
 * }));
 * ```
 */
export type BackgroundOptions = {
  /**
   * Error handler for failed background tasks. Defaults to console logging if not provided.
   * @param error - The error from the failed task
   * @returns void or Promise<void>
   */
  onError?: (error: unknown) => void | Promise<void>;
};

/**
 * A background task that wraps an async function for execution.
 *
 * @template P - Parameter types for the task function
 * @example
 * ```typescript
 * // Create and run a simple task
 * const task = new BackgroundTask(async () => {
 *   console.log('Task executed');
 * });
 * await task.run();
 *
 * // Task with parameters
 * const emailTask = new BackgroundTask(
 *   async (email: string, subject: string) => {
 *     await sendEmail(email, subject);
 *   },
 *   "user@example.com",
 *   "Welcome"
 * );
 * ```
 */
// biome-ignore lint/suspicious/noExplicitAny: Allow adding tasks with any arguments
export class BackgroundTask<P extends any[]> implements IBackgroundTask {
  /** The function to execute */
  public readonly func: TaskFunction<P>;
  /** Arguments for the function */
  public readonly args: P;
  /** Whether the function is async */
  public readonly isAsync: boolean;

  /**
   * Creates a new BackgroundTask.
   *
   * @param func - The async function to execute
   * @param args - Arguments to pass to the function
   */
  constructor(func: TaskFunction<P>, ...args: P) {
    this.func = func;
    this.args = args;
    this.isAsync = isAsyncFunction(func);
  }

  /**
   * Executes the background task.
   *
   * @returns Promise that resolves when execution completes
   * @throws Error if function is not async
   */
  async run(): Promise<void> {
    if (this.isAsync) {
      await this.func(...this.args);
    } else {
      throw new Error(
        'Background task does not support synchronous functions. Please use async functions.',
      );
      // NOTE: Tried to make sync functions run in the background — nope, didn’t work at all.
      // They block the event loop completely. I even gave Worker threads a shot, but that just made things worse.
      // It’s just not built for this, and honestly... I gave up. No idea how to make it work cleanly.
      // So yeah, async only for now. Sorry folks!
      // References: https://bun.sh/docs/api/workers, https://developer.mozilla.org/en-US/docs/Web/API/Worker
    }
  }
}

/**
 * Collection of background tasks that execute sequentially.
 * If one task fails, execution stops.
 *
 * @example
 * ```typescript
 * // Create task queue and add tasks
 * const tasks = new BackgroundTasks();
 *
 * tasks.addTask(async () => {
 *   console.log("First task");
 * });
 *
 * tasks.addTask(async (name: string) => {
 *   console.log(`Hello ${name}`);
 * }, "World");
 *
 * // Execute all tasks
 * await tasks.run();
 * ```
 */
export class BackgroundTasks implements IBackgroundTask {
  /** Array of background tasks */
  // biome-ignore lint/suspicious/noExplicitAny:Allow adding tasks with any arguments
  public readonly tasks: BackgroundTask<any[]>[];

  /**
   * Creates a new BackgroundTasks instance.
   *
   * @param tasks - Initial tasks (optional)
   */
  constructor(
    // biome-ignore lint/suspicious/noExplicitAny: Allow adding tasks with any arguments
    tasks: BackgroundTask<any[]>[] = [],
  ) {
    this.tasks = tasks;
  }

  /**
   * Adds a background task to the queue.
   *
   * @template P - Parameter types for the task function
   * @param func - The async function to execute
   * @param args - Arguments to pass to the function
   */
  // biome-ignore lint/suspicious/noExplicitAny: Allow adding tasks with any arguments
  addTask<P extends any[]>(func: TaskFunction<P>, ...args: P): void {
    const task = new BackgroundTask(func, ...args);
    this.tasks.push(task);
  }

  /**
   * Executes all tasks sequentially.
   * If one task fails, execution stops and the error is thrown.
   *
   * @returns Promise that resolves when all tasks complete
   * @throws Error if any task fails
   */
  async run(): Promise<void> {
    for (const task of this.tasks) {
      await task.run();
    }
  }
}

/**
 * Creates an Elysia plugin for background task processing.
 * Tasks execute sequentially after the HTTP response is sent.
 *
 * @param options - Configuration options for error handling
 * @returns Elysia plugin with background task functionality
 *
 * @example
 * ```typescript
 * // Basic usage
 * const app = new Elysia()
 *   .use(background())
 *   .post('/users', ({ backgroundTasks, body }) => {
 *     backgroundTasks.addTask(async () => {
 *       await sendWelcomeEmail(body.email);
 *     });
 *     return { id: body.id, status: 'created' };
 *   });
 *
 * // With custom error handling
 * const app = new Elysia()
 *   .use(background({
 *     onError: (error) => {
 *       console.error('Background task failed:', error);
 *       Sentry.captureException(error);
 *     }
 *   }))
 *   .post('/process', ({ backgroundTasks }) => {
 *     backgroundTasks.addTask(async () => {
 *       await processData();
 *     });
 *     return { status: 'processing' };
 *   });
 * ```
 */
export function background(options?: BackgroundOptions) {
  return new Elysia({
    name: 'elysia-background',
    seed: options,
  })
    .derive(() => ({
      backgroundTasks: new BackgroundTasks(),
    }))
    .onAfterResponse(({ backgroundTasks }) => {
      backgroundTasks.run().catch((error) => {
        if (options?.onError) {
          // Don't await - let user handle sync/async as needed
          // If error handler throws, it becomes unhandled rejection
          options.onError(error);
        } else {
          console.error('[elysia-background] Task failed:', error);
        }
      });
    })
    .as('scoped');
}
