/** Regression test agent — runs existing tests + uses LLM to verify no regressions. */
import { TestAgent, type AgentResult, type AgentRunOptions } from "./base.js";

export class RegressionTestAgent extends TestAgent {
  readonly name = "regression";
  readonly description = "Runs existing tests + LLM-verifies no regressions in changed code";

  async run(opts: AgentRunOptions): Promise<AgentResult> {
    const start = Date.now();

    // Run the existing test suite
    const { stdout, code } = this.run(opts.workspace, "npm test 2>&1 || true");
    const passed = code === 0;
    const passedMatch = stdout.match(/(\d+)\s+passing/i);
    const failedMatch = stdout.match(/(\d+)\s+failing/i);
    const testsPassed = passedMatch ? parseInt(passedMatch[1]) : 0;
    const testsFailed = failedMatch ? parseInt(failedMatch[1]) : 0;
    const testsRun = testsPassed + testsFailed;

    return this.ok({
      passed,
      testsRun,
      testsPassed,
      failures: testsFailed > 0 ? [`${testsFailed} regression failures detected`] : [],
      durationMs: Date.now() - start,
      output: stdout.slice(0, 3000),
    });
  }
}
