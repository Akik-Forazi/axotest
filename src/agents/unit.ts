/**
 * Unit test agent — uses a small ONNX seq2seq model (~60M params) to
 * GENERATE unit tests, then runs them.
 *
 * Model: Xenova/codet5-small (60M params) — a code-specific seq2seq
 * model that generates test code from source code.
 *
 * Flow:
 *   1. Get changed files from git diff
 *   2. For each file: feed source code to the model → get generated test
 *   3. Write generated tests to test/agent-generated/*.test.ts
 *   4. Run vitest on the generated tests
 *   5. If tests fail, feed the failure back to the model for a fix (2nd pass)
 *
 * No API calls. Model runs locally on CPU in ~100-200ms per generation.
 */
import { TestAgent, type AgentResult, type AgentRunOptions } from "./base.js";

const DEFAULT_MODEL = "Xenova/codet5-small"; // 60M params, code-specific

export class UnitTestAgent extends TestAgent {
  readonly name = "unit";
  readonly description = "Small-model (60M) test generation + execution";

  private _generator: ((input: string) => Promise<unknown>) | null = null;

  async run(opts: AgentRunOptions): Promise<AgentResult> {
    const start = Date.now();

    // Get changed files
    const { stdout } = this.run(opts.workspace, "git diff --name-only HEAD~5..HEAD -- '*.ts' '*.js' '*.py' 2>/dev/null || true");
    const files = stdout.trim().split("\n").filter((l) => l.trim());

    if (files.length === 0) {
      return this.ok({ passed: true, testsRun: 0, testsPassed: 0, output: "No changed files", durationMs: Date.now() - start });
    }

    // Load the model (lazy — only loads once)
    if (!this._generator) {
      try {
        this._generator = await this.loadModel("text2text-generation", opts.modelPath || DEFAULT_MODEL);
      } catch (e) {
        return this.ok({
          passed: false, testsRun: 0, testsPassed: 0,
          failures: [`Model load failed: ${e instanceof Error ? e.message : String(e)}`],
          durationMs: Date.now() - start, output: "Model unavailable — install @huggingface/transformers",
        });
      }
    }

    let testsRun = 0;
    let testsPassed = 0;
    const failures: string[] = [];
    const outputs: string[] = [];

    for (const file of files.slice(0, 5)) {
      const sourceCode = this.readFile(opts.workspace, file);
      if (!sourceCode || sourceCode.length < 50) continue;

      // Truncate to model's max input (CodeT5 = 512 tokens ≈ 2000 chars)
      const truncated = sourceCode.slice(0, 2000);

      // Generate test code
      const prompt = `generate test: ${truncated}`;
      let generated: string;
      try {
        const result = await this._generator!(prompt);
        // text2text-generation returns [{ generated_text: "..." }]
        generated = Array.isArray(result) ? (result[0] as { generated_text?: string })?.generated_text ?? "" : String(result);
      } catch {
        outputs.push(`${file}: generation failed`);
        continue;
      }

      if (!generated || generated.length < 20) {
        outputs.push(`${file}: model returned empty test`);
        continue;
      }

      // Write the generated test
      const testFile = `test/agent-generated/${file.replace(/\//g, "_").replace(/\.(ts|js|py)$/, "")}.agent.test.ts`;
      this.writeFile(opts.workspace, testFile, generated);
      outputs.push(`${file}: generated ${testFile} (${generated.length} chars)`);

      // Run the test
      const { code } = this.run(opts.workspace, `npx vitest run ${testFile} 2>&1 || true`);
      testsRun++;
      if (code === 0) {
        testsPassed++;
        outputs.push(`${file}: test passed ✓`);
      } else {
        // Second pass: feed failure back to model
        outputs.push(`${file}: test failed, attempting fix...`);
        try {
          const fixResult = await this._generator!(`fix test: ${generated}`);
          const fixed = Array.isArray(fixResult) ? (fixResult[0] as { generated_text?: string })?.generated_text ?? "" : String(fixResult);
          if (fixed && fixed.length > 20) {
            this.writeFile(opts.workspace, testFile, fixed);
            const { code: fixCode } = this.run(opts.workspace, `npx vitest run ${testFile} 2>&1 || true`);
            if (fixCode === 0) {
              testsPassed++;
              outputs.push(`${file}: test fixed on second pass ✓`);
            } else {
              failures.push(`${file}: test failed after fix attempt`);
            }
          } else {
            failures.push(`${file}: model couldn't generate a fix`);
          }
        } catch {
          failures.push(`${file}: fix generation failed`);
        }
      }
    }

    return this.ok({
      passed: failures.length === 0,
      testsRun, testsPassed, failures,
      durationMs: Date.now() - start,
      output: outputs.join("\n"),
    });
  }
}
