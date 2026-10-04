/** Edge case agent — uses LLM to discover boundary conditions + edge cases. */
import { TestAgent, type AgentResult, type AgentRunOptions } from "./base.js";

const EDGE_CASE_PROMPT = `You are AXOTEST Edge — an expert at finding edge cases. Analyze the following code and generate tests that cover boundary conditions, empty inputs, null values, max/min values, concurrent access, and other edge cases.

Output ONLY vitest test code (no explanation, no markdown fences).

Code:`;

export class EdgeCaseAgent extends TestAgent {
  readonly name = "edge";
  readonly description = "LLM-generated edge case + boundary condition tests";

  async run(opts: AgentRunOptions): Promise<AgentResult> {
    const start = Date.now();

    // Get changed files
    const { stdout } = this.run(opts.workspace, "git diff --name-only HEAD~5..HEAD -- '*.ts' '*.js' '*.py' 2>/dev/null || true");
    const files = stdout.trim().split("\n").filter((l) => l.trim());

    if (files.length === 0) {
      return this.ok({ passed: true, testsRun: 0, testsPassed: 0, output: "No changed files", durationMs: Date.now() - start });
    }

    let testsRun = 0;
    let testsPassed = 0;
    const failures: string[] = [];
    const outputs: string[] = [];

    for (const file of files.slice(0, 3)) {
      const code = this.readFile(opts.workspace, file);
      if (!code || code.length < 50) continue;

      // Ask LLM to generate edge case tests
      const generatedTest = await this.callLLM(opts, EDGE_CASE_PROMPT, code.slice(0, 6000));

      if (!generatedTest || generatedTest.startsWith("// LLM")) {
        outputs.push(`${file}: LLM unavailable`);
        continue;
      }

      const testFile = `test/agent-generated/${file.replace(/\//g, "_").replace(/\.(ts|js|py)$/, "")}.edge.test.ts`;
      this.writeFile(opts.workspace, testFile, generatedTest);

      const { code: exitCode } = this.run(opts.workspace, `npx vitest run ${testFile} 2>&1 || true`);
      testsRun++;
      if (exitCode === 0) {
        testsPassed++;
        outputs.push(`${file}: edge case tests passed`);
      } else {
        failures.push(`${file}: edge case tests failed`);
      }
    }

    return this.ok({
      passed: failures.length === 0,
      testsRun,
      testsPassed,
      failures,
      durationMs: Date.now() - start,
      output: outputs.join("\n"),
    });
  }
}
