#!/usr/bin/env node
/**
 * AXOTEST CLI — Axo Test.
 *
 * Multi-agent testing with axodex. Runs after any agent finishes
 * development. Spawns 5 small agents, each testing a different aspect:
 *   1. Unit test generation
 *   2. Integration test generation
 *   3. Regression test (diff against baseline)
 *   4. Edge case discovery
 *   5. Security test
 *
 * Usage:
 *   axotest run [options]     Run all test agents on the current repo
 *   axotest run --only unit   Run only the unit test agent
 *   axotest report            Show the last test run report
 *   axotest --version         Print version
 *   axotest --help            Show help
 *
 * Works with any coding agent (Claude, Codex, Cursor, AXONIZ, etc.) —
 * just run `axotest run` after the agent finishes development.
 *
 * Subscription: $0.90/mo with 1 month free tier.
 * Set AXOTEST_LICENSE_KEY to activate.
 */

import process from "node:process";
import { AXOTEST_VERSION, AXOTEST_VERSION_SEMVER } from "./version.js";
import { runTests } from "./runner.js";

const HELP = `
  AXOTEST  ${AXOTEST_VERSION}  — Axo Test

  Multi-agent testing with axodex code intelligence.
  Runs after any agent finishes development.

  USAGE
    axotest run [options]     Run all test agents on the current repo
      --only <agent>          Run only one agent (unit|integration|regression|edge|security)
      --model <model>         Override the model (default: auto-select cheapest)
      --provider <p>          Provider: openai, anthropic, groq, ollama, lmstudio
      --fix                   Auto-fix failing tests (second pass)
    axotest report             Show the last test run report
    axotest --version          Print version
    axotest --help             Show this help

  TEST AGENTS (5 parallel)
    1. unit           — Generates + runs unit tests for changed code
    2. integration    — Tests cross-module interactions
    3. regression     — Diffs against baseline, ensures no regressions
    4. edge           — Discovers boundary conditions + edge cases
    5. security       — Checks for common vulnerabilities

  AXODEX INTEGRATION
    Uses 'axodex query' + 'axodex impact' to understand what changed
    and which symbols are affected. Only tests the blast radius, not
    the whole repo.

  SUBSCRIPTION
    $0.90/mo with 1 month free tier.
    Set AXOTEST_LICENSE_KEY env var to activate.
    Without a key, runs in free-tier mode (limited to 3 runs/day).

  COMPATIBILITY
    Works with: Claude, Codex, Cursor, AXONIZ, Aider, Continue, etc.
    Just run 'axotest run' after your agent finishes development.
`;

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const cmd = args[0];

  if (cmd === "--version" || cmd === "-v") {
    console.log(`axotest ${AXOTEST_VERSION}  (npm: ${AXOTEST_VERSION_SEMVER})`);
    return;
  }

  if (cmd === "--help" || cmd === "-h" || !cmd) {
    console.log(HELP);
    return;
  }

  switch (cmd) {
    case "run": {
      const only = args.includes("--only") ? args[args.indexOf("--only") + 1] : undefined;
      const model = args.includes("--model") ? args[args.indexOf("--model") + 1] : undefined;
      const provider = args.includes("--provider") ? args[args.indexOf("--provider") + 1] : undefined;
      const fix = args.includes("--fix");

      const result = await runTests({
        workspace: process.cwd(),
        onlyAgent: only,
        model,
        provider,
        autoFix: fix,
      });

      console.log(`\n  ── AXOTEST Report ──────────────────────────`);
      console.log(`  Agents: ${result.agentsRun.length}/${result.totalAgents}`);
      for (const a of result.agentsRun) {
        const icon = a.passed ? "[+]" : "[!]";
        console.log(`  ${icon} ${a.name.padEnd(16)} ${a.testsPassed}/${a.testsRun} passed (${a.durationMs}ms)`);
        if (a.failures.length > 0) {
          for (const f of a.failures.slice(0, 3)) {
            console.log(`      └─ ${f}`);
          }
        }
      }
      console.log(`\n  Total: ${result.totalPassed}/${result.totalTests} passed`);
      console.log(`  Duration: ${(result.totalDurationMs / 1000).toFixed(1)}s`);
      if (result.fixesApplied > 0) {
        console.log(`  Auto-fixes applied: ${result.fixesApplied}`);
      }
      console.log(`  ────────────────────────────────────────────\n`);

      process.exitCode = result.totalPassed === result.totalTests ? 0 : 1;
      break;
    }
    case "report": {
      // TODO: read last report from ~/.axotest/reports/
      console.log("\n  No previous report found. Run 'axotest run' first.\n");
      break;
    }
    default:
      console.log(HELP);
      break;
  }
}

void main();
