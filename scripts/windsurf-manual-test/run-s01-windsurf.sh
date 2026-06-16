#!/usr/bin/env bash
# run-s01-windsurf.sh — S01 — Pure Vibe Coder / ClearBill / Short Sprint
#
# Cross-OS (Linux / macOS / Windows-Git-Bash) Windsurf + Nexpath behaviour test.
# Capture = Cascade hook; delivery = nexpath extension (status bar → sidebar →
# inject). Keep _windsurf-test-lib.sh next to this file. Layer C byte-identical
# to sub-7, so the fire/silent pattern matches the CLI sim.
#
# Usage:  bash run-s01-windsurf.sh
set -uo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

SCENARIO_ID="S01"
SCENARIO_TITLE="S01 — Pure Vibe Coder / ClearBill / Short Sprint"
SCENARIO_PERSONA="Marcus — freelance graphic designer, no coding knowledge"
INIT_NAME="clearBill-windsurf-test"
INIT_TYPE="Web App"
INIT_LANG="JavaScript"
INIT_DESC="Invoice SaaS for freelancers (windsurf test)"
TOTAL_PROMPTS=35
EXPECTED_ADVISORIES=3

# shellcheck source=_windsurf-test-lib.sh
source "$SCRIPT_DIR/_windsurf-test-lib.sh"

windsurf_test_setup

# ─── S01 prompts (35) ─────────────────────────────────────────────────
run_prompt 1 "make me a website where i can create invoices and send them to clients and track if they paid" "NO" "" "" "silent (min gate)"
run_prompt 2 "make it look nice with a clean dashboard" "NO" "" "" "silent"
run_prompt 3 "add login so i can have an account" "NO" "" "" "silent"
run_prompt 4 "add a page to create a new invoice with client name and amount and due date" "NO" "" "" "silent"
run_prompt 5 "add stripe so clients can pay the invoice online" "NO" "" "" "silent"
run_prompt 6 "add a dashboard that shows total amount owed and total paid this month" "NO" "" "" "silent"
run_prompt 7 "the login is not working on my phone fix it" "NO" "" "" "silent"
run_prompt 8 "add a button to send the invoice by email to the client" "NO" "" "" "silent"
run_prompt 9 "make the invoice page show a paid stamp when client pays" "NO" "" "" "silent"
run_prompt 10 "add pdf download for the invoice" "NO" "" "" "silent"
run_prompt 11 "make the dashboard show overdue invoices in red" "NO" "" "" "silent"
run_prompt 12 "the stripe payment is working but i dont see it update in the dashboard" "NO" "" "" "silent"
run_prompt 13 "add a client list page where i can see all my clients" "NO" "" "" "silent"
run_prompt 14 "add a notes field to each client" "NO" "" "" "boundary (14/15)"
run_prompt 15 "add recurring invoices so i can set an invoice to repeat monthly" "YES" "absence:test_creation" "2" "absence:test_creation"
run_prompt 16 "make it so the recurring invoice sends automatically on the due date" "NO" "" "" "silent (post-cooldown)"
run_prompt 17 "make the site look more professional with a better font and more white space" "NO" "" "" "silent"
run_prompt 18 "add an automatic reminder email before an invoice due date" "NO" "" "" "silent"
run_prompt 19 "add a settings page where i can change my business name and logo" "NO" "" "" "silent"
run_prompt 20 "make the invoice number auto-increment each time i create a new one" "NO" "" "" "silent"
run_prompt 21 "add a way to filter invoices by client name or date" "NO" "" "" "silent"
run_prompt 22 "add a client portal where clients can log in and see their invoices" "YES" "absence:security_check" "2" "absence:security_check"
run_prompt 23 "make the client portal show when each invoice was last viewed" "NO" "" "" "silent"
run_prompt 24 "add a way for clients to download their invoices from the portal" "NO" "" "" "silent"
run_prompt 25 "let me add a custom message to each invoice before sending it" "NO" "" "" "silent"
run_prompt 26 "add a button to mark an invoice as written off if the client never pays" "NO" "" "" "silent"
run_prompt 27 "add a page that shows my revenue for each month as a chart" "NO" "" "" "silent"
run_prompt 28 "make the logo nicer and add my business name to the top" "NO" "" "" "silent"
run_prompt 29 "add a loading spinner so the page doesnt look broken while loading" "NO" "" "" "silent"
run_prompt 30 "i think its ready can i publish it" "YES" "stage_transition" "1" "stage_transition (release)"
run_prompt 31 "ok how do i get a domain name for it" "NO" "" "" "silent"
run_prompt 32 "i bought the domain name how do i connect it to my app" "NO" "" "" "silent"
run_prompt 33 "how do i put it on the internet" "NO" "" "" "silent"
run_prompt 34 "add google analytics so i can see how many people visit my site" "NO" "" "" "silent"
run_prompt 35 "ok its live i shared the link with my first client" "NO" "" "" "silent"

windsurf_test_finish
