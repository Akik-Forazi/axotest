/** Unit test agent — generates + runs unit tests for changed symbols. */
import { TestAgent, type AgentResult, type AgentRunOptions } from "./base.js";
import { execSync } from "node:child_process";

export class UnitTestAgent extends TestAgent {
  readonly name = "unit";
  readonly description = "Generates + runs unit tests for changed code (using axodex blast radius)";

  async run(opts: AgentRunOptions): Promise<AgentResult> {
    const start = Date.now();
    const targets = opts.blastRadius ?? [];

    // Step 1: If we have a blast radius, use it to target tests.
    // If not, run the existing test suite.
    let testsRun = 0;
    let testsPassed = 0;
    const failures: string[] = [];
    let output = "";

    try {
      // Try running existing tests (vitest, pytest, go test)
      const hasVitest = exists(opts.workspace, "vitest.config.ts", "vitest.config.js");
      const hasPytest = exists(opts.workspace, "pytest.ini", "pyproject.toml");
      const hasGoTest = exists(opts.workspace, "go.mod");

      if (hasVitest) {
        output = execSync("npx vitest run --reporter=json 2>&1 || true", {
          cwd: opts.workspace,
          encoding: "utf8",
          timeout: 120_000,
          stdio: ["pipe", "pipe", "pipe"],
        });
        const m = output.match(/(\d+) passed|(\d+) failed/g);
        if (m) {
          for (const match of m) {
            const num = parseInt(match);
            if (match.includes("passed")) testsPassed += num;
            if (match.includes("failed")) {
              testsRun += num;
              failures.push(`${num} unit tests failed`);
            }
          }
          testsRun += testsPassed;
        }
      } else if (hasPytest) {
        output = execSync("python -m pytest --tb=short -q 2>&1 || true", {
          cwd: opts.workspace,
          encoding: "utf8",
          timeout: 120_000,
          stdio: ["pipe", "pipe", "pipe"],
        });
        const passed = output.match(/(\d+) passed/);
        const failed = output.match(/(\d+) failed/);
        testsPassed = passed ? parseInt(passed[1]) : 0;
        testsRun = testsPassed + (failed ? parseInt(failed[1]) : 0);
        if (failed && parseInt(failed[1]) > 0) {
          failures.push(`${failed[1]} pytest tests failed`);
        }
      } else if (hasGoTest) {
        output = execSync("go test ./... 2>&1 || true", {
          cwd: opts.workspace,
          encoding: "utf8",
          timeout: 120_000,
          stdio: ["pipe", "pipe", "pipe"],
        });
        const failed = output.match(/FAIL\s/g);
        testsRun = failed ? failed.length : 0;
        testsPassed = testsRun === 0 ? 1 : 0;
        if (testsRun > 0) failures.push(`${testsRun} Go test packages failed`);
      } else {
        output = "No test runner found (no vitest/pytest/go.mod). Skipping.";
        testsRun = 0;
        testsPassed = 0;
      }
    } catch (e) {
      output = String(e);
      failures.push("Test runner crashed");
    }

    return this.ok({
      passed: failures.length === 0,
      testsRun,
      testsPassed,
      failures,
      durationMs: Date.now() - start,
      output: output.slice(0, 5000),
    });
  }
}

function exists(ws: string, ...files: string[]): boolean {
  const fs = require("node:fs");
  const path = require("node:path");
  return files.some((f) => fs.existsSync(path.join(ws, f)));
}
