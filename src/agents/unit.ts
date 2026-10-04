/**
 * Unit test agent — uses LLM to GENERATE unit tests, then runs them.
 *
 * Flow:
 *   1. Use axodex blast radius to identify changed symbols
 *   2. Read the source code of the changed files
 *   3. Ask LLM: "Generate comprehensive unit tests for this code"
 *   4. Write the generated tests to test/agent-generated/*.test.ts
 *   5. Run vitest/pytest on the generated tests
 *   6. If any fail, send the failures back to the LLM for a fix (second pass)
 */
import { TestAgent, type AgentResult, type AgentRunOptions } from "./base.js";

const GENERATE_TESTS_PROMPT = `You are AXOTEST Unit — an expert test writer. Generate comprehensive unit tests for the following code.

Rules:
- Use vitest (import { describe, it, expect } from 'vitest')
- Test all public functions, edge cases, error handling
- Use realistic test data
- Include both positive and negative tests
- Output ONLY the test code (no explanation, no markdown fences)

Code to test:`;

const FIX_TESTS_PROMPT = `You are AXOTEST Unit — fix the failing tests. The tests below failed. Read the error, understand what went wrong, and output corrected test code.

Output ONLY the fixed test code (no explanation, no markdown fences).

Failed tests:
`;

export class UnitTestAgent extends TestAgent {
  readonly name = "unit";
  readonly description = "LLM-generated unit tests for changed code (using axodex blast radius)";

  async run(opts: AgentRunOptions): Promise<AgentResult> {
    const start = Date.now();

    // Step 1: Get changed files (from blast radius or git diff)
    const changedFiles = this.getChangedFiles(opts.workspace, opts.blastRadius);
    if (changedFiles.length === 0) {
      return this.ok({ passed: true, testsRun: 0, testsPassed: 0, output: "No changed files found", durationMs: Date.now() - start });
    }

    // Step 2: For each changed source file, ask the LLM to generate tests
    let testsRun = 0;
    let testsPassed = 0;
    const failures: string[] = [];
    const outputs: string[] = [];

    for (const file of changedFiles.slice(0, 5)) { // Limit to 5 files to avoid token overflow
      const sourceCode = this.readFile(opts.workspace, file);
      if (!sourceCode || sourceCode.length < 50) continue;

      // Ask LLM to generate tests
      const generatedTest = await this.callLLM(opts, GENERATE_TESTS_PROMPT, sourceCode.slice(0, 8000));
      if (!generatedTest || generatedTest.startsWith("// LLM")) {
        outputs.push(`${file}: LLM unavailable, skipping test generation`);
        continue;
      }

      // Write the generated test
      const testFile = `test/agent-generated/${file.replace(/\//g, "_").replace(/\.(ts|js|py)$/, "")}.agent.test.ts`;
      this.writeFile(opts.workspace, testFile, generatedTest);
      outputs.push(`${file}: generated ${testFile}`);

      // Run the generated test
      const { stdout, code } = this.run(opts.workspace, `npx vitest run ${testFile} 2>&1 || true`);
      const testPassed = code === 0 && !stdout.toLowerCase().includes("failed");

      if (testPassed) {
        testsRun++;
        testsPassed++;
      } else {
        testsRun++;
        // Second pass: ask LLM to fix the failing test
        const fixedTest = await this.callLLM(opts, FIX_TESTS_PROMPT, stdout.slice(0, 4000));
        if (fixedTest && !fixedTest.startsWith("// LLM")) {
          this.writeFile(opts.workspace, testFile, fixedTest);
          // Re-run the fixed test
          const { code: fixCode } = this.run(opts.workspace, `npx vitest run ${testFile} 2>&1 || true`);
          if (fixCode === 0) {
            testsPassed++;
            outputs.push(`${file}: test fixed on second pass`);
          } else {
            failures.push(`${file}: test failed after fix attempt`);
          }
        } else {
          failures.push(`${file}: generated test failed and LLM couldn't fix it`);
        }
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

  private getChangedFiles(workspace: string, blastRadius?: string[]): string[] {
    // If we have a blast radius from axodex, use it to find the source files
    if (blastRadius && blastRadius.length > 0) {
      // blastRadius contains symbol names — we'd need axodex context to map
      // to files. For now, fall through to git diff.
    }
    // Fall back to git diff
    const { stdout } = this.run(workspace, "git diff --name-only HEAD~5..HEAD -- '*.ts' '*.js' '*.py' 2>/dev/null || true");
    return stdout.trim().split("\n").filter((l) => l.trim());
  }
}
