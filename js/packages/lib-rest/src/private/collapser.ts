// Collapses repeated invocations to a method over some time, gathering all provided args into a single invocation.
import { throttle } from "throttle-debounce";

export function collect<T>(ms: number, fn: (a: T[]) => void): (a: T) => void {
  let args: T[] = [];
  const throttled = throttle(
    ms,
    () => {
      // re-assign args prior to invocation in case fn calls the throttled fn again.
      const x = args;
      args = [];
      fn(x);
    },
    {
      noLeading: true,
      noTrailing: false,
    }
  );
  return (a: T) => {
    args.push(a);
    throttled();
  };
}
