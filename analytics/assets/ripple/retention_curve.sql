/* @bruin
name: ripple.retention_curve
type: duckdb.sql
materialization:
  type: table
depends:
  - raw.events
  - ripple.decisions
columns:
  - name: pct_watching
    type: double
    checks:
      - name: not_null
custom_checks:
  - name: retention stays between 0 and 100
    query: SELECT count(*) FROM ripple.retention_curve WHERE pct_watching < 0 OR pct_watching > 100
    value: 0
@bruin */

-- Share of the town still watching at each second of each run.
WITH runs AS (
    SELECT run_id, MAX(TRY_CAST(value AS DOUBLE)) AS duration
    FROM raw.events
    WHERE type = 'round_start'
    GROUP BY run_id
),
viewers AS (
    SELECT run_id, COUNT(DISTINCT resident_id) AS n
    FROM ripple.decisions
    GROUP BY run_id
),
exits AS (
    SELECT run_id, resident_id, MIN(video_t) AS left_at
    FROM ripple.decisions
    WHERE action = 'scroll'
    GROUP BY run_id, resident_id
),
seconds AS (
    SELECT r.run_id, s.t
    FROM runs r, generate_series(0, TRY_CAST(CEIL(r.duration) AS BIGINT)) AS s(t)
)
SELECT
    s.run_id,
    s.t AS second,
    ROUND(100.0 * (v.n - COUNT(e.resident_id)) / v.n, 1) AS pct_watching
FROM seconds s
JOIN viewers v USING (run_id)
LEFT JOIN exits e ON e.run_id = s.run_id AND e.left_at <= s.t
GROUP BY s.run_id, s.t, v.n
ORDER BY s.run_id, s.t
