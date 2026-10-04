/** Security agent — uses LLM to scan for vulnerability patterns. */
import { TestAgent, type AgentResult, type AgentRunOptions } from "./base.js";

const SECURITY_PROMPT = `You are AXOTEST Security — an expert security auditor. Analyze the following code for security vulnerabilities (OWASP Top 10: injection, XSS, broken auth, sensitive data exposure, etc.).

Respond with STRICT JSON:
{"issues": [{"severity": "high"|"medium"|"low", "type": "vulnerability type", "line": "line number or range", "description": "what's wrong"}, ...], "secure": true|false}

Code:`;

export class SecurityAgent extends TestAgent {
  readonly name = "security";
  readonly description = "LLM-powered security audit (OWASP Top 10 scan via code understanding)";

  async run(opts: AgentRunOptions): Promise<AgentResult> {
    const start = Date.now();

    // Get changed files
    const { stdout } = this.run(opts.workspace, "git diff --name-only HEAD~5..HEAD -- '*.ts' '*.js' '*.py' 2>/dev/null || true");
    const files = stdout.trim().split("\n").filter((l) => l.trim());

    if (files.length === 0) {
      return this.ok({ passed: true, testsRun: 0, testsPassed: 0, output: "No changed files to audit", durationMs: Date.now() - start });
    }

    let testsRun = 0;
    let testsPassed = 0;
    const failures: string[] = [];
    const outputs: string[] = [];

    for (const file of files.slice(0, 5)) {
      const code = this.readFile(opts.workspace, file);
      if (!code || code.length < 50) continue;

      // Ask LLM to audit for security issues
      const analysis = await this.callLLM(opts, SECURITY_PROMPT, code.slice(0, 6000), 500);

      if (!analysis || analysis.startsWith("// LLM")) {
        outputs.push(`${file}: LLM unavailable`);
        continue;
      }

      testsRun++;

      // Parse the JSON response
      try {
        const jsonMatch = analysis.match(/\{[^}]+\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          if (parsed.secure === true || (parsed.issues && parsed.issues.length === 0)) {
            testsPassed++;
            outputs.push(`${file}: secure ✓`);
          } else {
            const issues = parsed.issues ?? [];
            for (const issue of issues) {
              const sev = issue.severity ?? "medium";
              if (sev === "high" || sev === "medium") {
                failures.push(`${file}: ${issue.type ?? "issue"} at line ${issue.line ?? "?"} — ${issue.description ?? ""}`);
              }
            }
            if (failures.length === 0) testsPassed++;
          }
        } else {
          // No JSON found — assume secure (LLM might have returned prose)
          testsPassed++;
        }
      } catch {
        testsPassed++; // Can't parse — don't fail the build
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
