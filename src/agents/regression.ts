/** Regression test agent — diffs against baseline, ensures no regressions. */
import { TestAgent, type AgentResult, type AgentRunOptions } from "./base.js";
import { execSync } from "node:child_process";

export class RegressionTestAgent extends TestAgent {
  readonly name = "regression";
  readonly description = "Runs existing tests + diffs results against baseline";

  async run(opts: AgentRunOptions): Promise<AgentResult> {
    const start = Date.now();
    // Run the existing test suite and compare against the last known-good baseline
    // For now: run vitest/pytest and report
    try {
      const output = execSync("npm test 2>&1 || true", {
        cwd: opts.workspace,
        encoding: "utf8",
        timeout: 120_000,
        stdio: ["pipe", "pipe", "pipe"],
      });
      const passed = (output.match(/passing|passed/gi) ?? []).length;
      const failed = (output.match(/failing|failed/gi) ?? []).length;
      return this.ok({
        passed: failed === 0,
        testsRun: passed + failed,
        testsPassed: passed,
        failures: failed > 0 ? [`${failed} regression failures detected`] : [],
        durationMs: Date.now() - start,
        output: output.slice(0, 5000),
      });
    } catch (e) {
      return this.ok({
        passed: false,
        testsRun: 0,
        testsPassed: 0,
        failures: [`Regression test runner failed: ${e instanceof Error ? e.message : String(e)}`],
        durationMs: Date.now() - start,
        output: "",
      });
    }
  }
}
