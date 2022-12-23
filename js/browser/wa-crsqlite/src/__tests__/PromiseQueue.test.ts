import PromiseQueue from "../PromiseQueue.js";
import { test, expect } from "vitest";

const makeDelay = () => new Promise((resolve) => setTimeout(resolve, 0));

test("exceptions reject all promises in the line", async () => {
  const q = new PromiseQueue();

  let numRun = 0;
  const task = () => {
    numRun++;
    return makeDelay();
  };

  let threw = false;
  try {
    await Promise.all([
      q.add(task),
      q.add(task),
      q.add(() => {
        throw new Error();
      }),
      q.add(task),
      q.add(task),
    ]);
  } catch (e) {
    threw = true;
  }

  expect(threw).toBe(true);
  expect(numRun).toBe(2);
});

test("concurrent tasks are serialized", async () => {
  let basket: string[] = [];
  const q = new PromiseQueue();

  const makeTask = (item: string) => async () => {
    await makeDelay();
    basket.push(item);
  };

  await Promise.all([
    q.add(makeTask("a")),
    q.add(makeTask("b")),
    q.add(makeTask("c")),
    q.add(makeTask("d")),
  ]);

  expect(basket).toEqual(["a", "b", "c", "d"]);
});

test("exceptions are thrown back up the stack to the user", async () => {
  const q = new PromiseQueue();
  expect(async () =>
    q.add(() => {
      throw new Error();
    })
  ).rejects.toThrow();
});

test("new tasks can be enqueued after an exception has been handled", async () => {
  const q = new PromiseQueue();

  let numRun = 0;
  const task = () => {
    numRun++;
    return makeDelay();
  };

  let threw = false;
  try {
    await Promise.all([
      q.add(task),
      q.add(task),
      q.add(() => {
        throw new Error();
      }),
    ]);
  } catch (e) {
    threw = true;
  }

  expect(threw).toBe(true);
  expect(numRun).toBe(2);

  await Promise.all([q.add(task), q.add(task)]);

  expect(numRun).toBe(4);
});

test("new tasks are all still serialized after an exception", async () => {
  // this is a bit hard to test.
  // we have to run all the things without awaiting so we can submit things
  // while the queue is handling a failure (via event loop timeslicing).

  let basket: number[] = [];
  const q = new PromiseQueue();

  const makeTask = (item: number) => () =>
    makeDelay().then(() => basket.push(item));

  let last: any = null;
  for (let i = 0; i < 100; ++i) {
    last = q.add(makeTask(i));
    last.catch(() => {});
    if (i === 10) {
      q.add(() => {
        throw new Error();
      });
    }
    if (i % 2 == 0) {
      await makeDelay();
    }
  }

  // if everything was correctly serialized, even in the face of errors,
  // we have a monotonically increasing sequence.
  let prev = -1;
  await last;

  for (const x of basket) {
    expect(x).greaterThan(prev);
    prev = x;
  }
  console.log(basket);
});
