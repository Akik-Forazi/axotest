/** Base test agent — includes LLM call infrastructure. */
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

export interface AgentRunOptions {
  workspace: string;
  model?: string;
  provider?: string;
  baseUrl?: string;
  apiKey?: string;
  blastRadius?: string[];
}

export interface AgentResult {
  name: string;
  passed: boolean;
  testsRun: number;
  testsPassed: number;
  failures: string[];
  durationMs: number;
  output: string;
}

export abstract class TestAgent {
  abstract readonly name: string;
  abstract readonly description: string;
  abstract run(opts: AgentRunOptions): Promise<AgentResult>;

  protected ok(partial: Partial<AgentResult>): AgentResult {
    return {
      name: this.name,
      passed: partial.passed ?? true,
      testsRun: partial.testsRun ?? 0,
      testsPassed: partial.testsPassed ?? 0,
      failures: partial.failures ?? [],
      durationMs: partial.durationMs ?? 0,
      output: partial.output ?? "",
    };
  }

  /**
   * Call an LLM to generate something (a test, an analysis, etc.)
   * Uses any OpenAI-compatible endpoint.
   */
  protected async callLLM(
    opts: AgentRunOptions,
    systemPrompt: string,
    userContent: string,
    maxTokens = 2000,
  ): Promise<string> {
    const baseUrl = opts.baseUrl || process.env.AXOTEST_BASE_URL || "http://localhost:1234/v1";
    const apiKey = opts.apiKey || process.env.AXOTEST_API_KEY || "";
    const model = opts.model || process.env.AXOTEST_MODEL || "qwen2.5-coder-7b-instruct";

    try {
      const res = await fetch(`${baseUrl.replace(/\/$/, "")}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userContent },
          ],
          temperature: 0.3,
          max_tokens: maxTokens,
        }),
        signal: AbortSignal.timeout(60_000),
      });

      if (!res.ok) {
        return `// LLM call failed: ${res.status} ${res.statusText}`;
      }

      const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
      return data.choices?.[0]?.message?.content ?? "";
    } catch (e) {
      return `// LLM unreachable: ${e instanceof Error ? e.message : String(e)}`;
    }
  }

  /** Read a file from the workspace. */
  protected readFile(workspace: string, relPath: string): string {
    try {
      return fs.readFileSync(path.join(workspace, relPath), "utf8");
    } catch {
      return "";
    }
  }

  /** Write a file to the workspace. */
  protected writeFile(workspace: string, relPath: string, content: string): void {
    const fullPath = path.join(workspace, relPath);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, content);
  }

  /** Run a shell command in the workspace. */
  protected run(workspace: string, cmd: string, timeoutMs = 120_000): { stdout: string; code: number | null } {
    try {
      const stdout = execSync(cmd, {
        cwd: workspace,
        encoding: "utf8",
        timeout: timeoutMs,
        stdio: ["pipe", "pipe", "pipe"],
      });
      return { stdout, code: 0 };
    } catch (e) {
      const err = e as { stdout?: string; status?: number };
      return { stdout: err.stdout ?? "", code: err.status ?? 1 };
    }
  }

  /** Check if a file exists in the workspace. */
  protected exists(workspace: string, ...files: string[]): boolean {
    return files.some((f) => fs.existsSync(path.join(workspace, f)));
  }
}
