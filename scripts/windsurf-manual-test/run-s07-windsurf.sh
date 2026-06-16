#!/usr/bin/env bash
# run-s07-windsurf.sh — S07 — Senior Backend Engineer / FleetOps / Medium Sprint
#
# Cross-OS (Linux / macOS / Windows-Git-Bash) Windsurf + Nexpath behaviour test.
# Capture = Cascade hook; delivery = nexpath extension (status bar → sidebar →
# inject). Keep _windsurf-test-lib.sh next to this file. Layer C byte-identical
# to sub-7, so the fire/silent pattern matches the CLI sim.
#
# Usage:  bash run-s07-windsurf.sh
set -uo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

SCENARIO_ID="S07"
SCENARIO_TITLE="S07 — Senior Backend Engineer / FleetOps / Medium Sprint"
SCENARIO_PERSONA="Carlos — 8 yrs Go/Python, builds proper APIs"
INIT_NAME="fleetOps-windsurf-test"
INIT_TYPE="SaaS Platform"
INIT_LANG="TypeScript / Go"
INIT_DESC="Fleet management SaaS for logistics companies"
TOTAL_PROMPTS=48
EXPECTED_ADVISORIES=3

# shellcheck source=_windsurf-test-lib.sh
source "$SCRIPT_DIR/_windsurf-test-lib.sh"

windsurf_test_setup

# ─── S07 prompts (48) ─────────────────────────────────────────────────
run_prompt 1 "I need to build a fleet management platform — vehicle tracking, driver management, maintenance scheduling, and fuel cost analytics. Let's start with the system architecture." "NO" "" "" "silent (min gate)"
run_prompt 2 "Create the PostgreSQL schema — vehicles, drivers, assignments, maintenance_logs, fuel_entries. Use proper foreign keys and indexes." "NO" "" "" "silent"
run_prompt 3 "Build REST API endpoints for vehicle CRUD with proper input validation and error responses." "NO" "" "" "silent"
run_prompt 4 "Add pagination and filtering to the vehicle list endpoint — support filter by status and assigned driver." "NO" "" "" "silent"
run_prompt 5 "Add the driver assignment system — enforce one driver per vehicle constraint at the database level." "NO" "" "" "silent"
run_prompt 6 "Add GET /assignments endpoint — return paginated active assignments with vehicle and driver details joined." "NO" "" "" "silent"
run_prompt 7 "Add soft delete for assignments — log the unassignment end time rather than deleting the record." "NO" "" "" "silent"
run_prompt 8 "Write unit tests for the assignment constraint — verify it rejects double assignments and handles concurrent requests." "NO" "" "" "silent (test_creation resets window)"
run_prompt 9 "Review the concurrent assignment test output and fix the race condition in the test setup." "NO" "" "" "silent"
run_prompt 10 "Build the maintenance scheduling module — auto-flag vehicles approaching mileage service thresholds." "NO" "" "" "silent"
run_prompt 11 "Add REST endpoints for the maintenance scheduling module — GET /maintenance/upcoming and POST /maintenance/schedule." "NO" "" "" "silent"
run_prompt 12 "Build the fuel entry model and CRUD endpoints — vehicle_id, driver_id, liters, cost_per_liter, odometer_reading." "NO" "" "" "silent"
run_prompt 13 "Add bulk CSV import for fuel entries with validation and duplicate detection." "NO" "" "" "silent"
run_prompt 14 "Add idempotency key support to the CSV import — prevent duplicate fuel entries on re-upload." "NO" "" "" "silent"
run_prompt 15 "The assignment endpoint returns 500 when driver ID doesn't exist — fix the error handling." "NO" "" "" "silent"
run_prompt 16 "Add structured request logging middleware — log method, path, response status, and latency for all routes." "NO" "" "" "silent"
run_prompt 17 "Add JWT verification middleware — validate tokens on all protected endpoints before the route handlers run." "NO" "" "" "silent"
run_prompt 18 "Add role-based access control — fleet managers get full CRUD, drivers see only their assignments and vehicle info." "NO" "" "" "silent"
run_prompt 19 "Generate an OpenAPI spec for all REST endpoints — include auth requirements and response schemas for frontend integration." "NO" "" "" "silent"
run_prompt 20 "Build the dashboard frontend — vehicle map, active assignments table, maintenance alerts panel." "NO" "" "" "silent"
run_prompt 21 "Add the vehicle detail view — show current driver, last GPS position, maintenance due date, and recent fuel entries." "NO" "" "" "silent"
run_prompt 22 "Add real-time GPS tracking via WebSocket — update vehicle positions on the map every 5 seconds." "NO" "" "" "boundary (14/15 from P8 reset)"
run_prompt 23 "Add geofencing alerts — notify fleet manager when a vehicle leaves its assigned zone." "YES" "absence:test_creation" "2" "absence:test_creation"
run_prompt 24 "Store geofence zone polygons in PostGIS — add a geofence_zones table with company_id, name, and polygon geometry." "NO" "" "" "silent (post-cooldown)"
run_prompt 25 "Handle WebSocket reconnection when vehicles go through dead zones — implement exponential backoff." "NO" "" "" "silent"
run_prompt 26 "Add JWT authentication to the WebSocket connection — verify the fleet manager's token before streaming GPS data." "NO" "" "" "silent"
run_prompt 27 "Add a vehicle health status endpoint — aggregate maintenance_logs to flag vehicles overdue for service." "NO" "" "" "silent"
run_prompt 28 "Add a driver performance metrics endpoint — calculate on-time delivery rate and fuel efficiency per driver from historical data." "NO" "" "" "silent"
run_prompt 29 "Add webhook notifications for maintenance-overdue vehicles — trigger alerts when a vehicle exceeds its service interval." "NO" "" "" "silent"
run_prompt 30 "Add Stripe subscription billing — charge per vehicle per month with usage-based overages." "NO" "" "" "silent"
run_prompt 31 "Add subscription status enforcement — reject API requests from companies with expired or unpaid subscriptions." "NO" "" "" "silent"
run_prompt 32 "Build the company onboarding API — create company account, configure fleet limits, attach Stripe subscription." "NO" "" "" "silent"
run_prompt 33 "Add multi-tenant data isolation — each company should see only their own fleet data." "YES" "absence:security_check" "2" "absence:security_check"
run_prompt 34 "Scope all database queries by company_id — update every repository method to filter by the authenticated company." "NO" "" "" "silent"
run_prompt 35 "Add row-level security policies in PostgreSQL — enforce company_id isolation at the database layer." "NO" "" "" "silent"
run_prompt 36 "Add integration tests for the data isolation layer — verify that queries for one company never return another company's records." "NO" "" "" "silent"
run_prompt 37 "Audit all API endpoints for missing company_id scoping — review every route handler before marking multi-tenancy done." "NO" "" "" "silent"
run_prompt 38 "Run the test suite and fix any failures from the multi-tenant changes." "NO" "" "" "silent (test+regression resets windows)"
run_prompt 39 "Fix the fleet manager permission check in the assignment endpoint — the role guard was checking the wrong claim." "NO" "" "" "silent"
run_prompt 40 "Configure database connection pooling — tune pool size, idle timeout, and max connection lifetime for production." "NO" "" "" "silent"
run_prompt 41 "Add a health check endpoint — return database connectivity status, schema migration version, and process uptime." "NO" "" "" "silent"
run_prompt 42 "Add the fleet analytics API — fuel cost trends, vehicle utilization rates, driver efficiency scores." "NO" "" "" "silent"
run_prompt 43 "Add rate limiting to the analytics endpoints — cap at 10 requests per minute per company, they run expensive aggregations." "NO" "" "" "silent"
run_prompt 44 "Add Redis caching for fuel cost trend queries — set a 5-minute TTL to avoid repeated full-table scans." "NO" "" "" "silent"
run_prompt 45 "Set up database migrations with version tracking — use golang-migrate so production deployments are idempotent." "NO" "" "" "silent"
run_prompt 46 "Separate environment configs — different database URLs and connection limits for development, staging, and production." "NO" "" "" "silent"
run_prompt 47 "Write Kubernetes deployment manifests — define resource limits, liveness probes, and horizontal scaling for the API service." "NO" "" "" "silent"
run_prompt 48 "We're targeting 5 beta customers next week. Let me prepare the production deployment." "YES" "stage_transition" "1" "stage_transition (release)"

windsurf_test_finish
