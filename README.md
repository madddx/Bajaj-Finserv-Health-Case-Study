# 🏆 Quiz Leaderboard System

> **Internship Assignment** — Bajaj Finserv Health | JAVA Qualifier | SRM | Apr 2024  
> A Node.js solution that polls a quiz API, deduplicates events, aggregates scores, and submits a correct leaderboard.

---

## 📋 Table of Contents

- [Problem Overview](#problem-overview)
- [Solution Architecture](#solution-architecture)
- [Key Challenge — Deduplication](#key-challenge--deduplication)
- [Project Structure](#project-structure)
- [Setup & Run](#setup--run)
- [How It Works — Step by Step](#how-it-works--step-by-step)
- [API Reference](#api-reference)
- [Running the Tests](#running-the-tests)
- [Design Decisions](#design-decisions)
- [Sample Output](#sample-output)

---

## Problem Overview

The validator simulates a quiz show where multiple participants earn scores across rounds.  
The API may return **duplicate event data** across polls — processing duplicates would inflate scores and produce an incorrect leaderboard.

**Goal:** Poll the API 10 times, deduplicate events, compute correct scores, and submit the leaderboard once.

---

## Solution Architecture

```
┌──────────────┐     poll 0–9      ┌──────────────────────┐
│   Node.js    │ ─────────────────▶│  GET /quiz/messages  │
│   Client     │◀─────────────────  │  (validator API)     │
└──────┬───────┘  raw events JSON  └──────────────────────┘
       │
       │  rawEvents[]  (may contain duplicates)
       ▼
┌─────────────────────────────────────┐
│  Deduplication                      │
│  Key = roundId + "|" + participant  │
│  Set<string> tracks seen events     │
└──────────────────┬──────────────────┘
                   │  unique events only
                   ▼
┌─────────────────────────────────────┐
│  Score Aggregation                  │
│  Map<participant, totalScore>       │
└──────────────────┬──────────────────┘
                   │
                   ▼
┌─────────────────────────────────────┐
│  Leaderboard Builder                │
│  Sorted by totalScore DESC          │
└──────────────────┬──────────────────┘
                   │
                   ▼
        POST /quiz/submit  (once)
```

---

## Key Challenge — Deduplication

The same event can appear in multiple polls. Processing it twice would corrupt scores.

### ❌ Wrong Approach
```
Poll 0 → { roundId: "R1", participant: "Alice", score: 10 }  → Alice += 10  (total 10)
Poll 3 → { roundId: "R1", participant: "Alice", score: 10 }  → Alice += 10  (total 20) ← WRONG
```

### ✅ Correct Approach
```
Composite key = roundId + "|" + participant

Poll 0 → key "R1|Alice" → NOT SEEN → process  → Alice = 10
Poll 3 → key "R1|Alice" → ALREADY SEEN → SKIP  → Alice = 10  ✓
```

**Implementation:**
```javascript
const seen = new Set();           // tracks composite keys
const scores = new Map();         // participant → totalScore

for (const { roundId, participant, score } of rawEvents) {
  const key = `${roundId}|${participant}`;
  if (seen.has(key)) continue;    // duplicate → skip
  seen.add(key);
  scores.set(participant, (scores.get(participant) ?? 0) + score);
}
```

The composite key `roundId|participant` ensures:
- The same participant **can** appear in multiple rounds (both counted ✅)
- The same round+participant pair is counted **only once** (deduped ✅)

---

## Project Structure

```
quiz-leaderboard/
├── src/
│   └── index.js          # Main solution – poll, dedup, aggregate, submit
├── tests/
│   └── unit.test.js      # Unit tests for core logic (no HTTP calls)
├── package.json
├── .gitignore
└── README.md
```

---

## Setup & Run

### Prerequisites
- **Node.js** v14+ (no external dependencies — uses built-in `https` module)

### 1. Clone the repo
```bash
git clone https://github.com/madddx/Bajaj-Finserv-Health-Case-Study.git
cd quiz-leaderboard
```

### 2. Set your registration number
Open `src/index.js` and update `CONFIG.REG_NO`:

```javascript
const CONFIG = {
  BASE_URL: "https://devapigw.vidalhealthtpa.com/srm-quiz-task",
  REG_NO: "RA2311033010039",   // ← replace with YOUR registration number
  TOTAL_POLLS: 10,
  POLL_DELAY_MS: 5000,   // mandatory 5-second delay between polls
};
```

### 3. Run
```bash
node src/index.js
```

The program will take approximately **~50 seconds** to complete (10 polls × 5 s delay).

---

## How It Works — Step by Step

### Step 1 – Poll 10 times
```javascript
for (let poll = 0; poll < 10; poll++) {
  const url = `.../quiz/messages?regNo=${REG_NO}&poll=${poll}`;
  const { data } = await httpsGet(url);
  allEvents.push(...data.events);
  await sleep(5000);  // mandatory delay
}
```
All raw events are collected in a single flat array before any processing.

### Step 2 – Deduplicate
Using a `Set` of composite keys (`roundId|participant`).  
Duplicate events are detected and silently skipped.

### Step 3 – Aggregate
Using a `Map` from participant name → running total.  
Only unique events contribute to a participant's score.

### Step 4 – Build Leaderboard
Sort the entries by `totalScore` in **descending** order.

### Step 5 – Submit Once
A single `POST /quiz/submit` call with the final leaderboard.

---

## API Reference

### GET `/quiz/messages`

| Param   | Type   | Description              |
|---------|--------|--------------------------|
| `regNo` | string | Your registration number |
| `poll`  | number | Poll index, `0` to `9`   |

**Response:**
```json
{
  "regNo": "2024CS101",
  "setId": "SET_1",
  "pollIndex": 0,
  "events": [
    { "roundId": "R1", "participant": "Alice", "score": 10 },
    { "roundId": "R1", "participant": "Bob",   "score": 20 }
  ]
}
```

---

### POST `/quiz/submit`

**Request body:**
```json
{
  "regNo": "2024CS101",
  "leaderboard": [
    { "participant": "Alice", "totalScore": 100 },
    { "participant": "Bob",   "totalScore": 120 }
  ]
}
```

**Response:**
```json
{
  "isCorrect": true,
  "isIdempotent": true,
  "submittedTotal": 220,
  "expectedTotal": 220,
  "message": "Correct!"
}
```

---

## Running the Tests

Unit tests validate deduplication and aggregation logic **without** any HTTP calls:

```bash
node tests/unit.test.js
```

### Test cases covered:
| # | Scenario |
|---|----------|
| 1 | Simple aggregation, no duplicates |
| 2 | Identical duplicate events discarded |
| 3 | Same participant across different rounds — both counted |
| 4 | Leaderboard sorted by score descending |
| 5 | Grand total calculation is correct after dedup |
| 6 | Empty events list → empty leaderboard |
| 7 | Multi-poll simulation with repeated data |

Expected output:
```
══════════════════════════════════════
  Quiz Leaderboard – Unit Test Suite  
══════════════════════════════════════

Test 1: Simple aggregation without duplicates
  ✅ PASS: Alice total = 25
  ✅ PASS: Bob total = 20
...
──────────────────────────────────────
  Results: 14 passed, 0 failed
──────────────────────────────────────
```

---

## Design Decisions

| Decision | Reason |
|---|---|
| **Zero external dependencies** | Uses Node.js built-in `https` module — no `npm install` required |
| **Composite key for dedup** | `roundId\|participant` is the minimal unique identifier per event |
| **Set for seen-keys** | O(1) lookup — scales to millions of events without performance issues |
| **Map for scores** | Cleaner than a plain object; avoids prototype-pollution edge cases |
| **Submit only once** | The assignment requires a single submission after all data is collected |
| **5 s delay enforced** | Mandatory per API specification — skipping it may violate rate limits |
| **Descending sort** | Conventional leaderboard ordering (highest score first) |

---

## Sample Output

```
═══════════════════════════════════════════════════
   Quiz Leaderboard System  –  Starting up
   Registration No : 2024CS101
   Total Polls     : 10
   Poll Delay      : 5s
═══════════════════════════════════════════════════

[2024-04-24T10:00:00.000Z] → Polling 0/9  GET .../quiz/messages?regNo=2024CS101&poll=0
[2024-04-24T10:00:00.120Z]   ✓ Poll 0 responded [HTTP 200] – setId=SET_1, events=4
[2024-04-24T10:00:00.121Z]   ⏱  Waiting 5s before next poll…
...
[2024-04-24T10:00:50.000Z] → Polling 9/9  GET .../quiz/messages?...&poll=9
[2024-04-24T10:00:50.115Z]   ✓ Poll 9 responded [HTTP 200] – setId=SET_1, events=4

📦 Total raw events collected (before dedup): 40
🔍 Unique events after dedup : 12
🗑️  Duplicate events discarded: 28

🏆 Leaderboard:
   1. Bob                  120
   2. Alice                100
   3. Carol                 80

💯 Grand Total Score: 300

📤 Submitting leaderboard...

📬 Submission Response [HTTP 200]:
   isCorrect     : true
   isIdempotent  : true
   submittedTotal: 300
   expectedTotal : 300
   message       : Correct!

✅ SUCCESS – Leaderboard accepted!
```

---

## License

MIT
