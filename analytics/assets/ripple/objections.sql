/* @bruin
name: ripple.objections
type: duckdb.sql
materialization:
  type: table
depends:
  - ripple.decisions
@bruin */

-- Why people scrolled away, in the order they left. The panel quotes these.
SELECT
    run_id,
    video_version,
    resident,
    model,
    video_t AS left_at,
    reason
FROM ripple.decisions
WHERE action = 'scroll'
ORDER BY run_id, video_t
