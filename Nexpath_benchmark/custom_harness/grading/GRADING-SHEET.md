# Layer 0 grading sheet

| | |
|---|---|
| **What this is** | the fixed rules for grading one popup section. Layer 0 uses nothing else |
| **Frozen** | 2026-09-26 — before any run |
| **Rule** | every question is **yes / no**. No score, no scale, **no AI judging** (owner rule) |
| **Unit** | one **section** of one popup. A popup's grade is the summary of its sections |

## How to read a popup

A NexPath popup is a list of sections, each with a title and a body. Grade **every guidance section**.
Skip the parts that are not guidance: the restated request, the confirmation line, and any button text.

---

## Rule 1 — names a real thing

**Question:** does the section name something from the user's own request — a file, a command, a flag, a page, a function?

| | example |
|---|---|
| ✅ pass | "Run the existing `dvc list` tests before changing the recursive path." |
| ❌ fail | "Test your changes carefully before moving on." |

A word counts only if it appears in the user's prompt or in the repository. A generic noun — *code, changes, tests, the feature* — does **not** count.

## Rule 2 — names its signal

**Applies to:** the *Best practices* section only (it exists because a signal fired).

**Question:** does the text name the practice it came from, in plain words?

| | example |
|---|---|
| ✅ pass | "No test has been written for this change yet — add one that fails before the fix." |
| ❌ fail | "Following good practices helps keep the project healthy." |

The internal key (`test_creation`) does not have to appear — the practice must.

## Rule 3 — no wrong advice

**Question:** does the section demand a dry run, a backup, a rollback plan or a pinned version, when the task does **not** deploy, release or migrate anything?

| | example |
|---|---|
| ✅ pass (no wrong advice) | "Check the flag against the existing import-url path before relying on it." |
| ❌ fail | "Take a backup and plan a rollback before applying this change." — on a task that only adds a CLI flag |

Judge the **task**, not the words: a task that really deploys or migrates may ask for all of these.

## Rule 4 — not empty, not filler

**Question:** could a developer act on this section without asking a follow-up question?

| | example |
|---|---|
| ✅ pass | "Add the flag to the `update` path too — it shares the same options." |
| ❌ fail | "Consider the implications of this change." · an empty body · a single word |

## Rule 5 — right language

**Question:** is the section written in the same language as the user's prompt?

| | example |
|---|---|
| ✅ pass | English prompt → English popup |
| ❌ fail | Hindi prompt → English popup, or a popup mixing both |

For the pilot every prompt is English, so this rule is a guard, not a measurement.

---

## What gets written down

One row per section:

| column | values |
|---|---|
| `run_id` | which run |
| `prompt_n` | 1–20 |
| `section` | the section title as shown |
| `r1_names_real_thing` | yes / no |
| `r2_names_signal` | yes / no / n_a (not *Best practices*) |
| `r3_no_wrong_advice` | yes / no |
| `r4_actionable` | yes / no |
| `r5_language` | yes / no |
| `grader` | `rule` (mechanical) or `human` |
| `note` | free text, optional |

## How a popup is summarised

| measure | meaning |
|---|---|
| **bad share** | sections failing rule 1, 3 or 4, as a share of all sections shown |
| **signal named** | share of *Best practices* sections passing rule 2 |
| **wrong advice** | share of popups with at least one rule-3 failure |

These three are the Layer 0 headline. They are compared **NexPath today vs NexPath with a change** — never against the control arm, which has no popups at all.

## What Layer 0 does **not** claim

| |
|---|
| a better-graded popup is **not** proof of better code — that is Layer 2 |
| the grades say nothing about how **often** a popup fires — that is Layer 1 |
| a section can pass every rule and still be unhelpful. The rules catch the failures we measured, not all of them |
