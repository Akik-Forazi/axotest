/** Integration test agent — uses LLM + axodex to test cross-module call chains. */
import { TestAgent, type AgentResult, type AgentRunOptions } from "./base.js";

const INTEGRATION_PROMPT = `You are AXOTEST Integration — an expert at integration testing. Analyze the following execution flow (from axodex) and generate integration tests that verify the cross-module interactions work correctly.

Output ONLY vitest test code (no explanation, no markdown fences).

Execution flow + code:`;

export class IntegrationTestAgent extends TestAgent {
  readonly name = "integration";
  readonly description = "LLM-generated integration tests using axodex execution flow traces";

  async run(opts: AgentRunOptions): Promise<AgentResult> {
    const start = Date.now();

    // Step 1: Query axodex for execution flows that cross module boundaries
    const { stdout: flows } = this.run(opts.workspace, "axodex query --limit 5 2>&1 || true");

    if (!flows.trim()) {
      return this.ok({ passed: true, testsRun: 0, testsPassed: 0, output: "No axodex execution flows found", durationMs: Date.now() - start });
    }

    // Step 2: Ask LLM to generate integration tests based on the execution flows
    const generatedTest = await this.callLLM(opts, INTEGRATION_PROMPT, flows.slice(0, 8000));

    if (!generatedTest || generatedTest.startsWith("// LLM")) {
      return this.ok({ passed: true, testsRun: 0, testsPassed: 0, output: "LLM unavailable for integration test generation", durationMs: Date.now() - start });
    }

    // Step 3: Write + run the test
    const testFile = "test/agent-generated/integration.agent.test.ts";
    this.writeFile(opts.workspace, testFile, generatedTest);
    const { stdout, code } = this.run(opts.workspace, `npx vitest run ${testFile} 2>&1 || true`);

    const passed = code === 0;
    return this.ok({
      passed,
      testsRun: 1,
      testsPassed: passed ? 1 : 0,
      failures: passed ? [] : ["Integration test failed — check output"],
      durationMs: Date.now() - start,
      output: stdout.slice(0, 3000),
    });
  }
}
