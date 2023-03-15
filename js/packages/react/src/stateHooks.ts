export function useThrottledState() {
  /**
   * - a query that provides the state
   * - a function to set the state
   * - a mutator to persist to the db
   *
   * If we're called back while we still have an outstanding write, ignore the callback
   */
}
