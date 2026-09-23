/**
 * Mock API client — the integration boundary.
 *
 * Everything the UI does asynchronously goes through this file. Swapping to
 * real endpoints means replacing the bodies here; no component imports
 * `src/lib/data/*` for anything that will one day be a network call.
 *
 * Scenario injection: append `?mock=<scenario>` to any URL to force a state.
 * This is how every error / empty / pending state in this build is reviewable
 * without breaking a real service. Documented in docs/error-states.md.
 */

export type MockScenario =
  | "ok"
  | "slow"
  | "error"
  | "timeout"
  | "empty"
  | "sold_out"
  | "price_changed"
  | "payment_failed"
  | "payment_timeout"
  | "supplier_pending"
  | "pickup_unavailable"
  | "offline";

export const SCENARIOS: { id: MockScenario; label: string; describes: string }[] = [
  { id: "ok", label: "Normal", describes: "Everything works" },
  { id: "slow", label: "Slow network", describes: "3s responses — skeletons visible" },
  { id: "error", label: "API error", describes: "Supplier API returns 500" },
  { id: "timeout", label: "API timeout", describes: "Availability check exceeds 8s" },
  { id: "empty", label: "No results", describes: "Search returns nothing" },
  { id: "sold_out", label: "Sold out", describes: "SKU has no availability" },
  { id: "price_changed", label: "Price changed", describes: "Re-consent required at checkout" },
  { id: "payment_failed", label: "Payment failed", describes: "Gateway declines" },
  { id: "payment_timeout", label: "Payment timeout", describes: "No webhook received" },
  { id: "supplier_pending", label: "Supplier pending", describes: "Manual confirmation flow" },
  { id: "pickup_unavailable", label: "Pickup unavailable", describes: "Hotel outside coverage" },
  { id: "offline", label: "Network error", describes: "Request never leaves the device" },
];

export class ApiError extends Error {
  constructor(
    message: string,
    readonly code: MockScenario,
    /** Plain-language recovery instruction shown to the customer. */
    readonly recovery: string,
    readonly retryable = true,
    /** Server field-level messages (VALIDATION_FAILED) — rendered inline at the field. */
    readonly fields?: Record<string, string>,
    /** The server's own §12 code (NOT_FOUND, RATE_LIMITED, NOT_CONFIGURED, …) when the error came from the API. */
    readonly serverCode?: string,
    /** HTTP status when the error came from the API. */
    readonly status?: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export function currentScenario(): MockScenario {
  if (typeof window === "undefined") return "ok";
  const p = new URLSearchParams(window.location.search).get("mock");
  return (SCENARIOS.find((s) => s.id === p)?.id ?? "ok") as MockScenario;
}

const LATENCY: Partial<Record<MockScenario, number>> = { slow: 2600, timeout: 8000 };

export function wait(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Wraps a mock resolution with realistic latency and scenario-driven failure.
 * `fastPath` scenarios are the ones that should fail rather than resolve.
 */
export async function mockCall<T>(
  resolve: () => T,
  opts: {
    latencyMs?: number;
    failsOn?: MockScenario[];
    scenario?: MockScenario;
  } = {},
): Promise<T> {
  const scenario = opts.scenario ?? currentScenario();
  const latency = LATENCY[scenario] ?? opts.latencyMs ?? 420;
  await wait(latency);

  if (opts.failsOn?.includes(scenario)) {
    throw errorFor(scenario);
  }
  return resolve();
}

export function errorFor(scenario: MockScenario): ApiError {
  switch (scenario) {
    case "timeout":
      return new ApiError(
        "Availability check timed out",
        "timeout",
        "The operator's system is slow right now. Try again, or message us on WhatsApp and we'll confirm your date directly.",
      );
    case "offline":
      return new ApiError(
        "Network unreachable",
        "offline",
        "You appear to be offline. Check your connection and try again — nothing has been charged.",
      );
    case "payment_failed":
      return new ApiError(
        "Payment declined by your bank",
        "payment_failed",
        "Your bank declined the payment. Nothing has been charged. Try another method, or we can send you a payment link on WhatsApp.",
        true,
      );
    case "payment_timeout":
      return new ApiError(
        "Payment confirmation not received",
        "payment_timeout",
        "We haven't heard back from the payment gateway. Do not pay again — we'll confirm within 10 minutes and message you either way.",
        false,
      );
    case "sold_out":
      return new ApiError(
        "No availability for the selected date",
        "sold_out",
        "That date has just sold out. Here are the next available dates.",
        false,
      );
    case "pickup_unavailable":
      return new ApiError(
        "Pickup zone not covered",
        "pickup_unavailable",
        "This supplier doesn't cover your hotel area. Message us and we'll arrange a private transfer or suggest an alternative.",
        false,
      );
    default:
      return new ApiError(
        "Something went wrong at our end",
        "error",
        "That's on us, not you. Try again in a moment — or message us on WhatsApp and we'll book it for you.",
      );
  }
}
