/**
 * Quiz Leaderboard System
 * Internship Assignment – Bajaj Finserv Health / SRM
 *
 * Flow:
 *  1. Poll /quiz/messages 10 times (poll = 0..9) with 5 s delay between each.
 *  2. Deduplicate events using composite key  →  roundId + "|" + participant
 *  3. Aggregate totalScore per participant.
 *  4. Sort leaderboard by totalScore (descending).
 *  5. POST /quiz/submit exactly once.
 */

const https = require("https");

// ─── Configuration ──────────────────────────────────────────────────────────

const CONFIG = {
  BASE_URL: "https://devapigw.vidalhealthtpa.com/srm-quiz-task",
  REG_NO: "2024CS101",          // ← replace with your registration number
  TOTAL_POLLS: 10,              // polls 0 – 9
  POLL_DELAY_MS: 5000,          // mandatory 5-second gap
};

// ─── Tiny HTTP helpers ───────────────────────────────────────────────────────

function httpsGet(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let body = "";
      res.on("data", (chunk) => (body += chunk));
      res.on("end", () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(body) });
        } catch (e) {
          reject(new Error(`JSON parse error: ${e.message}\nBody: ${body}`));
        }
      });
    }).on("error", reject);
  });
}

function httpsPost(url, payload) {
  const bodyStr = JSON.stringify(payload);
  const { hostname, pathname } = new URL(url);

  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname,
        path: pathname,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(bodyStr),
        },
      },
      (res) => {
        let body = "";
        res.on("data", (chunk) => (body += chunk));
        res.on("end", () => {
          try {
            resolve({ status: res.statusCode, data: JSON.parse(body) });
          } catch (e) {
            reject(new Error(`JSON parse error: ${e.message}\nBody: ${body}`));
          }
        });
      }
    );
    req.on("error", reject);
    req.write(bodyStr);
    req.end();
  });
}

// ─── Utility ─────────────────────────────────────────────────────────────────

const sleep = (ms) => new Promise((res) => setTimeout(res, ms));

function log(msg) {
  const ts = new Date().toISOString();
  console.log(`[${ts}] ${msg}`);
}

// ─── Core Logic ──────────────────────────────────────────────────────────────

/**
 * Step 1 – Poll the API 10 times and collect all raw events.
 * Returns: Array of all event objects received (may contain duplicates).
 */
async function pollAll() {
  const allEvents = [];

  for (let poll = 0; poll < CONFIG.TOTAL_POLLS; poll++) {
    const url = `${CONFIG.BASE_URL}/quiz/messages?regNo=${CONFIG.REG_NO}&poll=${poll}`;
    log(`→ Polling ${poll}/${CONFIG.TOTAL_POLLS - 1}  GET ${url}`);

    try {
      const { status, data } = await httpsGet(url);
      log(
        `  ✓ Poll ${poll} responded [HTTP ${status}] – setId=${data.setId}, events=${data.events?.length ?? 0}`
      );

      if (Array.isArray(data.events)) {
        allEvents.push(...data.events);
      }
    } catch (err) {
      log(`  ✗ Poll ${poll} FAILED: ${err.message}`);
    }

    // Mandatory 5-second delay – skip after the last poll
    if (poll < CONFIG.TOTAL_POLLS - 1) {
      log(`  ⏱  Waiting ${CONFIG.POLL_DELAY_MS / 1000}s before next poll…`);
      await sleep(CONFIG.POLL_DELAY_MS);
    }
  }

  log(`\n📦 Total raw events collected (before dedup): ${allEvents.length}`);
  return allEvents;
}

/**
 * Step 2 – Deduplicate events.
 * Key = roundId + "|" + participant  (unique per round per person)
 *
 * Step 3 – Aggregate totalScore per participant.
 * Returns: Map<participant, totalScore>
 */
function deduplicateAndAggregate(rawEvents) {
  const seen = new Set();           // composite keys already processed
  const scores = new Map();         // participant → totalScore

  let duplicates = 0;

  for (const event of rawEvents) {
    const { roundId, participant, score } = event;
    const key = `${roundId}|${participant}`;

    if (seen.has(key)) {
      duplicates++;
      continue; // skip duplicate
    }

    seen.add(key);
    scores.set(participant, (scores.get(participant) ?? 0) + score);
  }

  log(`🔍 Unique events after dedup : ${seen.size}`);
  log(`🗑️  Duplicate events discarded: ${duplicates}`);

  return scores;
}

/**
 * Step 4 – Build sorted leaderboard.
 * Returns: Array<{participant, totalScore}> sorted by totalScore DESC.
 */
function buildLeaderboard(scores) {
  const leaderboard = [...scores.entries()]
    .map(([participant, totalScore]) => ({ participant, totalScore }))
    .sort((a, b) => b.totalScore - a.totalScore);

  const grandTotal = leaderboard.reduce((sum, e) => sum + e.totalScore, 0);

  log("\n🏆 Leaderboard:");
  leaderboard.forEach((entry, i) => {
    log(`   ${i + 1}. ${entry.participant.padEnd(20)} ${entry.totalScore}`);
  });
  log(`\n💯 Grand Total Score: ${grandTotal}`);

  return { leaderboard, grandTotal };
}

/**
 * Step 5 – Submit the leaderboard once.
 */
async function submitLeaderboard(leaderboard) {
  const url = `${CONFIG.BASE_URL}/quiz/submit`;
  const payload = { regNo: CONFIG.REG_NO, leaderboard };

  log(`\n📤 Submitting leaderboard to ${url}`);
  log(`   Payload: ${JSON.stringify(payload)}`);

  const { status, data } = await httpsPost(url, payload);

  log(`\n📬 Submission Response [HTTP ${status}]:`);
  log(`   isCorrect     : ${data.isCorrect}`);
  log(`   isIdempotent  : ${data.isIdempotent}`);
  log(`   submittedTotal: ${data.submittedTotal}`);
  log(`   expectedTotal : ${data.expectedTotal}`);
  log(`   message       : ${data.message}`);

  return data;
}

// ─── Entry Point ─────────────────────────────────────────────────────────────

async function main() {
  log("═══════════════════════════════════════════════════");
  log("   Quiz Leaderboard System  –  Starting up        ");
  log(`   Registration No : ${CONFIG.REG_NO}             `);
  log(`   Total Polls     : ${CONFIG.TOTAL_POLLS}         `);
  log(`   Poll Delay      : ${CONFIG.POLL_DELAY_MS / 1000}s`);
  log("═══════════════════════════════════════════════════\n");

  // 1. Poll
  const rawEvents = await pollAll();

  // 2 & 3. Deduplicate + Aggregate
  const scores = deduplicateAndAggregate(rawEvents);

  // 4. Leaderboard
  const { leaderboard } = buildLeaderboard(scores);

  // 5. Submit
  const result = await submitLeaderboard(leaderboard);

  if (result.isCorrect) {
    log("\n✅ SUCCESS – Leaderboard accepted!");
  } else {
    log("\n❌ FAILED – Check deduplication logic.");
    log(`   Expected ${result.expectedTotal}, got ${result.submittedTotal}`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("\n💥 Unhandled error:", err);
  process.exit(1);
});
