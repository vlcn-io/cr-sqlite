/**
 * PromiseQueue is for cases when you need to serialize access to some async resource.
 *
 * This sounds counter-intuitive but there are APIs that provide async interfaces but are only allowed
 * to have one active caller to them at a time. Such is the case with all `wasm` binaries that use emscripten's
 * asyncify feature, such as wa-sqlite (see https://github.com/rhashimoto/wa-sqlite/issues/51).
 *
 * PromiseQueues have a few tricky edge cases.
 * The most naive implementation is just this:
 *
 * ```
 * q = Promise.resolve();
 * function addTask(task) {
 *   q = q.then(task);
 * }
 * ```
 *
 * The problem with the above is that if `task` ever throws, no new tasks can ever be added and run.
 *
 * So we can update this to:
 * ```
 * q = Promise.resolve();
 * function addTask(task) {
 *   q = q.then(task, (e) => console.error(e));
 * }
 * ```
 *
 * Now the prolbem is that exceptions are swallowed. This causes issues for cases when users need to
 * recover from errors in their tasks. The errors are hidden from them so they can't.
 *
 * Next attempt:
 * ```
 * q = Promise.resolve();
 * function addTask(task) {
 *   q = q.then(task).catch((e) => {
 *     q = Promise.resolve();
 *     throw e;
 *   });
 * }
 * ```
 *
 * The problem with this one is that if a long promise chain has built up:
 * ```
 * p1 -> p2 -> p3 -> p4
 * ```
 * and an exception is thrown at the start,
 * you get a new queue on every catch. I.e., a new queue
 * is created at `p2.catch`, `p3.catch`, `p4.catch`.
 *
 * Is users are enqueueing new tasks while the original exception is moving down the line,
 * they will get enqueued to different queues and run concurrently.
 *
 * The solution is to identify the first time a queue is handling an exception and only create a new queue then.
 * Killing the old queue and forking a new one internally.
 *
 * Queue of promises:
 * ```
 * p1 -> p2 -> p3 -> p4
 * ```
 *
 * Error thrown at p2:
 * ```
 *     p1 -> p2_ERR -> p3_ERR -> p4_ERR
 *                  \__newq -> pA -> pB -> pC
 *```
 */
export default class PromiseQueue {
  #exceptionCount = 0;
  #queue: Promise<any> = Promise.resolve();

  add<T>(task: () => T): Promise<T> {
    // TODO: only enable in dev builds?
    const source = new Error("Invoked from");
    let exceptionCountAtEnqueue = this.#exceptionCount;
    const res = this.#queue.then(task).catch((e) => {
      if (exceptionCountAtEnqueue === this.#exceptionCount) {
        ++this.#exceptionCount;
        this.#queue = Promise.resolve();
      }

      throw new AggregateError([e, source], e.message);
    });
    this.#queue = res;

    return res;
  }
}
