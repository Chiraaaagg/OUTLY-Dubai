import "server-only";
import { after } from "next/server";
import { log } from "./logger";

/**
 * Run work after the response has been sent (Next `after()`), so a customer
 * never waits on notifications or analytics fan-out. Outside a request scope
 * (tests, scripts) `after()` throws — fall back to running the task inline
 * without awaiting it. Errors are logged, never propagated.
 */
export function defer(name: string, task: () => Promise<unknown>): void {
  const run = () => task().catch((error) => log.error("deferred.failed", { name, error }));
  try {
    after(run);
  } catch {
    void run();
  }
}
