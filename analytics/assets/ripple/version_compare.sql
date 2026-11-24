/* @bruin
name: ripple.version_compare
type: duckdb.sql
materialization:
  type: table
depends:
  - ripple.funnel
@bruin */

-- v1 vs v2 side by side for the report card (most recent run of each round, by time).
WITH latest AS (
    SELECT *, ROW_NUMBER() OVER (PARTITION BY round ORDER BY started_at DESC) AS rn
    FROM ripple.funnel
)
SELECT
    round,
    video_version,
    run_id,
    hook_hold_pct,
    scrolled_pct,
    watched_pct,
    shared_pct,
    came_back_via_share,
    hook_hold_pct - LAG(hook_hold_pct) OVER (ORDER BY round) AS hook_hold_change,
    watched_pct - LAG(watched_pct) OVER (ORDER BY round)     AS watched_change,
    shared_pct - LAG(shared_pct) OVER (ORDER BY round)       AS shared_change
FROM latest
WHERE rn = 1
ORDER BY round
