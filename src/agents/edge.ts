/** Edge case agent — discovers boundary conditions + edge cases. */
import { TestAgent, type AgentResult, type AgentRunOptions } from "./base.js";

export class EdgeCaseAgent extends TestAgent {
  readonly name = "edge";
  readonly description = "Discovers boundary conditions + edge cases for changed code";

  async run(_opts: AgentRunOptions): Promise<AgentResult> {
    const start = Date.now();
    // TODO: Use a small LLM to generate edge-case tests (null inputs,
    // empty arrays, max int, concurrent access, etc.) for each symbol
    // in the blast radius.
    return this.ok({
      passed: true,
      testsRun: 0,
      testsPassed: 0,
      failures: [],
      durationMs: Date.now() - start,
      output: "Edge case agent — coming soon. Will generate boundary-condition tests via LLM.",
    });
  }
}
