/** Base test agent — includes small-model ONNX inference infrastructure. */
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

export interface AgentRunOptions {
  workspace: string;
  modelPath?: string;
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

const MODEL_CACHE_DIR = path.join(os.homedir(), ".axotest", "models");

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
   * Load a small ONNX model for a specific task.
   * Model is cached at ~/.axotest/models/ after first download.
   *
   * task: "text-classification" | "text-generation" | "token-classification" | "feature-extraction"
   * model: HuggingFace model ID (e.g., "Xenova/distilbert-base-uncased")
   *
   * All models are sub-200M params — runs on CPU in 10-50ms.
   */
  protected async loadModel(
    task: string,
    model: string,
  ): Promise<(input: string) => Promise<unknown>> {
    fs.mkdirSync(MODEL_CACHE_DIR, { recursive: true });

    const { pipeline } = await import("@huggingface/transformers");

    console.log(`  [axotest:${this.name}] Loading ${model} (${task}) — first run downloads model, cached at ${MODEL_CACHE_DIR}`);

    const pipe = await pipeline(task, model, {
      device: "cpu",
      cache_dir: MODEL_CACHE_DIR,
    });

    return (input: string) => pipe(input) as Promise<unknown>;
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

  /** Run a shell command. */
  protected run(workspace: string, cmd: string, timeoutMs = 120_000): { stdout: string; code: number | null } {
    try {
      const stdout = execSync(cmd, {
        cwd: workspace, encoding: "utf8", timeout: timeoutMs,
        stdio: ["pipe", "pipe", "pipe"],
      });
      return { stdout, code: 0 };
    } catch (e) {
      const err = e as { stdout?: string; status?: number };
      return { stdout: err.stdout ?? "", code: err.status ?? 1 };
    }
  }
}
