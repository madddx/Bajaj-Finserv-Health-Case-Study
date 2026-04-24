/**
 * Unit Tests – Quiz Leaderboard System
 * Run: node tests/unit.test.js
 *
 * Tests core logic WITHOUT making any real HTTP calls.
 */

// ─── Re-implement the pure functions inline so we can test them in isolation ──

function deduplicateAndAggregate(rawEvents) {
  const seen = new Set();
  const scores = new Map();

  for (const event of rawEvents) {
    const { roundId, participant, score } = event;
    const key = `${roundId}|${participant}`;
    if (seen.has(key)) continue;
    seen.add(key);
    scores.set(participant, (scores.get(participant) ?? 0) + score);
  }
  return scores;
}

function buildLeaderboard(scores) {
  return [...scores.entries()]
    .map(([participant, totalScore]) => ({ participant, totalScore }))
    .sort((a, b) => b.totalScore - a.totalScore);
}

// ─── Test Runner ─────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function assert(condition, testName) {
  if (condition) {
    console.log(`  ✅ PASS: ${testName}`);
    passed++;
  } else {
    console.error(`  ❌ FAIL: ${testName}`);
    failed++;
  }
}

function assertEqual(actual, expected, testName) {
  if (JSON.stringify(actual) === JSON.stringify(expected)) {
    console.log(`  ✅ PASS: ${testName}`);
    passed++;
  } else {
    console.error(`  ❌ FAIL: ${testName}`);
    console.error(`     Expected: ${JSON.stringify(expected)}`);
    console.error(`     Actual  : ${JSON.stringify(actual)}`);
    failed++;
  }
}

// ─── Tests ───────────────────────────────────────────────────────────────────

console.log("\n══════════════════════════════════════");
console.log("  Quiz Leaderboard – Unit Test Suite  ");
console.log("══════════════════════════════════════\n");

// Test 1: No duplicates – simple aggregation
console.log("Test 1: Simple aggregation without duplicates");
{
  const events = [
    { roundId: "R1", participant: "Alice", score: 10 },
    { roundId: "R1", participant: "Bob",   score: 20 },
    { roundId: "R2", participant: "Alice", score: 15 },
  ];
  const scores = deduplicateAndAggregate(events);
  assertEqual(scores.get("Alice"), 25, "Alice total = 25");
  assertEqual(scores.get("Bob"),   20, "Bob total = 20");
}

// Test 2: Identical duplicate events should be ignored
console.log("\nTest 2: Duplicate events are discarded");
{
  const events = [
    { roundId: "R1", participant: "Alice", score: 10 },
    { roundId: "R1", participant: "Alice", score: 10 }, // duplicate
    { roundId: "R1", participant: "Alice", score: 10 }, // duplicate
    { roundId: "R1", participant: "Bob",   score: 20 },
  ];
  const scores = deduplicateAndAggregate(events);
  assertEqual(scores.get("Alice"), 10, "Alice counted once = 10");
  assertEqual(scores.get("Bob"),   20, "Bob = 20");
}

// Test 3: Same participant, different rounds → both counted
console.log("\nTest 3: Same participant across different rounds");
{
  const events = [
    { roundId: "R1", participant: "Carol", score: 30 },
    { roundId: "R2", participant: "Carol", score: 30 },
    { roundId: "R3", participant: "Carol", score: 30 },
    { roundId: "R1", participant: "Carol", score: 30 }, // dup of R1
  ];
  const scores = deduplicateAndAggregate(events);
  assertEqual(scores.get("Carol"), 90, "Carol = 90 (3 unique rounds × 30)");
}

// Test 4: Leaderboard sorted descending
console.log("\nTest 4: Leaderboard sort order");
{
  const events = [
    { roundId: "R1", participant: "Alice", score: 50 },
    { roundId: "R1", participant: "Bob",   score: 80 },
    { roundId: "R1", participant: "Carol", score: 65 },
  ];
  const scores = deduplicateAndAggregate(events);
  const board  = buildLeaderboard(scores);
  assertEqual(board[0].participant, "Bob",   "1st place = Bob");
  assertEqual(board[1].participant, "Carol", "2nd place = Carol");
  assertEqual(board[2].participant, "Alice", "3rd place = Alice");
}

// Test 5: Grand total calculation
console.log("\nTest 5: Grand total across leaderboard");
{
  const events = [
    { roundId: "R1", participant: "X", score: 100 },
    { roundId: "R2", participant: "Y", score: 200 },
    { roundId: "R1", participant: "X", score: 100 }, // dup
  ];
  const scores = deduplicateAndAggregate(events);
  const board  = buildLeaderboard(scores);
  const total  = board.reduce((s, e) => s + e.totalScore, 0);
  assertEqual(total, 300, "Grand total = 300 (deduped)");
}

// Test 6: Empty events list
console.log("\nTest 6: Empty events produce empty leaderboard");
{
  const scores = deduplicateAndAggregate([]);
  const board  = buildLeaderboard(scores);
  assertEqual(board.length, 0, "Empty leaderboard for no events");
}

// Test 7: Realistic multi-poll simulation (same data repeated across polls)
console.log("\nTest 7: Multi-poll simulation with repeated data");
{
  const poll0 = [
    { roundId: "R1", participant: "Alice", score: 10 },
    { roundId: "R1", participant: "Bob",   score: 20 },
  ];
  const poll3 = [  // same as poll 0 – should be ignored
    { roundId: "R1", participant: "Alice", score: 10 },
    { roundId: "R1", participant: "Bob",   score: 20 },
  ];
  const poll5 = [
    { roundId: "R2", participant: "Alice", score: 40 },
  ];

  const allRaw = [...poll0, ...poll3, ...poll5];
  const scores = deduplicateAndAggregate(allRaw);
  assertEqual(scores.get("Alice"), 50, "Alice = 10 + 40 (dup R1 discarded)");
  assertEqual(scores.get("Bob"),   20, "Bob = 20 (dup discarded)");
  const total = buildLeaderboard(scores).reduce((s, e) => s + e.totalScore, 0);
  assertEqual(total, 70, "Grand total = 70");
}

// ─── Summary ─────────────────────────────────────────────────────────────────

console.log("\n──────────────────────────────────────");
console.log(`  Results: ${passed} passed, ${failed} failed`);
console.log("──────────────────────────────────────\n");

if (failed > 0) process.exit(1);
