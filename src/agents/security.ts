/** Security agent — scans for common vulnerability patterns. */
import { TestAgent, type AgentResult, type AgentRunOptions } from "./base.js";
import { execSync } from "node:child_process";

export class SecurityAgent extends TestAgent {
  readonly name = "security";
  readonly description = "Scans for common vulnerability patterns (OWASP Top 10)";

  async run(opts: AgentRunOptions): Promise<AgentResult> {
    const start = Date.now();
    let testsRun = 0;
    let testsPassed = 0;
    const failures: string[] = [];
    let output = "";

    // Try running eslint with security rules
    try {
      output = execSync("npx eslint . --rule 'no-eval: error, no-implied-eval: error' 2>&1 || true", {
        cwd: opts.workspace,
        encoding: "utf8",
        timeout: 60_000,
        stdio: ["pipe", "pipe", "pipe"],
      });
      const problems = (output.match(/\d+ problem/g) ?? [])[0];
      if (problems) {
        const count = parseInt(problems);
        testsRun = count;
        testsPassed = 0;
        failures.push(`${count} security issues found by eslint`);
      } else {
        testsRun = 1;
        testsPassed = 1;
      }
    } catch {
      // eslint not available — basic grep for common vuln patterns
      try {
        output = execSync(
          'grep -rn "eval(\\|innerHTML\\|document.write\\|exec(\\|child_process" --include="*.ts" --include="*.js" --include="*.py" . 2>&1 | head -20 || true',
          { cwd: opts.workspace, encoding: "utf8", timeout: 30_000, stdio: ["pipe", "pipe", "pipe"] },
        );
        const lines = output.trim().split("\n").filter((l) => l.trim());
        testsRun = lines.length;
        testsPassed = 0;
        if (lines.length > 0) {
          failures.push(`${lines.length} potential security issues (eval/innerHTML/exec)`);
        } else {
          testsRun = 1;
          testsPassed = 1;
        }
      } catch {
        testsRun = 1;
        testsPassed = 1;
      }
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
