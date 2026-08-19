/**
 * Takes the network away from the unit suite.
 *
 * Every module that reaches outside injects its way out: models are parameters (ADR-0002),
 * the Slack post takes a fetch, the precedent embedder is passed in. That convention is only
 * as good as the next test remembering it, and the failure when someone forgets is the worst
 * shape available: the suite goes green on a machine with credentials and a live webhook, and
 * a real Slack channel gets a message from a test fixture. A test that forgets should fail
 * loudly on the machine that wrote it instead.
 *
 * The stub throws synchronously rather than rejecting, so a call that is never awaited still
 * takes the test down at the line that made it.
 */
globalThis.fetch = ((input: RequestInfo | URL) => {
  throw new Error(`unexpected network call in unit tests: ${String(input)}`);
}) as typeof globalThis.fetch;
