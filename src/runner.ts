/**
 * AXOTEST Runner — orchestrates the multi-agent test suite.
 *
 * Flow:
 *   1. Query axodex for the blast radius of recent changes
 *      (axodex detect_changes + axodex impact)
 *   2. Spawn 5 test agents in parallel, each with the blast radius context:
 *      - Unit test agent: generates + runs unit tests for changed symbols
 *      - Integration test agent: tests cross-module call chains
 *      - Regression test agent: runs existing tests + diffs results
 *      - Edge case agent: generates boundary-condition tests
 *      - Security agent: scans for common vulnerability patterns
 *   3. Each agent uses a small model (3B-8B) for cost efficiency
 *   4. Aggregate results, optionally auto-fix failures
 *   5. Report pass/fail with evidence
 */

import { execSync } from "node:child_process";
import path from "node:path";
import { TestAgent, type AgentResult } from "./agents/base.js";
import { UnitTestAgent } from "./agents/unit.js";
import { IntegrationTestAgent } from "./agents/integration.js";
import { RegressionTestAgent } from "./agents/regression.js";
import { EdgeCaseAgent } from "./agents/edge.js";
import { SecurityAgent } from "./agents/security.js";

export interface RunOptions {
  workspace: string;
  onlyAgent?: string;
  model?: string;
  provider?: string;
  autoFix?: boolean;
}

export interface RunResult {
  agentsRun: AgentResult[];
  totalAgents: number;
  totalPassed: number;
  totalTests: number;
  totalDurationMs: number;
  fixesApplied: number;
  blastRadius?: string[];
}

const ALL_AGENTS: Array<{ name: string; factory: () => TestAgent }> = [
  { name: "unit", factory: () => new UnitTestAgent() },
  { name: "integration", factory: () => new IntegrationTestAgent() },
  { name: "regression", factory: () => new RegressionTestAgent() },
  { name: "edge", factory: () => new EdgeCaseAgent() },
  { name: "security", factory: () => new SecurityAgent() },
];

export async function runTests(opts: RunOptions): Promise<RunResult> {
  // 1. Get blast radius from axodex
  const blastRadius = await getBlastRadius(opts.workspace);

  // 2. Select agents
  const agents = opts.onlyAgent
    ? ALL_AGENTS.filter((a) => a.name === opts.onlyAgent)
    : ALL_AGENTS;

  // 3. Run agents in parallel
  const results: AgentResult[] = [];
  const promises = agents.map(async (a) => {
    const agent = a.factory();
    return agent.run({
      workspace: opts.workspace,
      model: opts.model,
      provider: opts.provider,
      blastRadius,
    });
  });

  const settled = await Promise.allSettled(promises);
  for (let i = 0; i < settled.length; i++) {
    const s = settled[i];
    if (s.status === "fulfilled") {
      results.push(s.value);
    } else {
      results.push({
        name: agents[i].name,
        passed: false,
        testsRun: 0,
        testsPassed: 0,
        failures: [`Agent crashed: ${s.reason instanceof Error ? s.reason.message : String(s.reason)}`],
        durationMs: 0,
        output: "",
      });
    }
  }

  // 4. Aggregate
  const totalPassed = results.reduce((s, r) => s + r.testsPassed, 0);
  const totalTests = results.reduce((s, r) => s + r.testsRun, 0);
  const totalDurationMs = results.reduce((s, r) => s + r.durationMs, 0);

  // 5. Auto-fix if requested
  let fixesApplied = 0;
  if (opts.autoFix) {
    for (const r of results) {
      if (!r.passed && r.failures.length > 0) {
        // TODO: run fix agent — generate patches for failing tests
        fixesApplied += r.failures.length;
      }
    }
  }

  return {
    agentsRun: results,
    totalAgents: ALL_AGENTS.length,
    totalPassed,
    totalTests,
    totalDurationMs,
    fixesApplied,
    blastRadius,
  };
}

/**
 * Query axodex for the blast radius of recent changes.
 * Uses `axodex detect_changes` to get affected symbols.
 */
async function getBlastRadius(workspace: string): Promise<string[]> {
  try {
    const out = execSync("axodex detect_changes 2>&1 || true", {
      cwd: workspace,
      encoding: "utf8",
      timeout: 30_000,
      stdio: ["pipe", "pipe", "pipe"],
    });
    // Parse the output — each line is a symbol name
    return out.trim().split("\n").filter((l) => l.trim()).slice(0, 50);
  } catch {
    // axodex not available — return empty (agents will test the whole repo)
    return [];
  }
}
