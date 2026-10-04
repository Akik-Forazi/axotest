/** Base test agent interface. All 5 agents implement this. */
export interface AgentRunOptions {
  workspace: string;
  model?: string;
  provider?: string;
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
}
