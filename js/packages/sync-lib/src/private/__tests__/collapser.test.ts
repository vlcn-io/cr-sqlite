import { test, expect, vi } from "vitest";
import { collect } from "../collapser";

test("many invocations are collapsed into a single invocation", () => {
  vi.useFakeTimers();

  let count = 0;
  const fn = collect(100, (args) => {
    count++;
    expect(args).toEqual([1, 2, 3]);
  });
  fn(1);
  fn(2);
  fn(3);
  expect(count).toBe(0);

  vi.runAllTimers();
  expect(count).toBe(1);
});
