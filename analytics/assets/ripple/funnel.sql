/* @bruin
name: ripple.funnel
type: duckdb.sql
materialization:
  type: table
depends:
  - ripple.decisions
  - raw.events
columns:
  - name: residents
    type: integer
    checks:
      - name: positive
@bruin */

-- Per run: how many residents held past the hook, finished, engaged and shared.
WITH per_resident AS (
    SELECT
        run_id,
        round,
        video_version,
        resident_id,
        MIN(CASE WHEN action = 'scroll' THEN video_t END) AS left_at,
        MAX(CASE WHEN action IN ('like', 'comment', 'share') THEN 1 ELSE 0 END) AS engaged,
        MAX(CASE WHEN action = 'share' THEN 1 ELSE 0 END) AS shared
    FROM ripple.decisions
    GROUP BY run_id, round, video_version, resident_id
),
rewatches AS (
    SELECT run_id, COUNT(*) AS came_back_via_share
    FROM raw.events
    WHERE type = 'second_chance' AND action = 'rewatch'
    GROUP BY run_id
)
SELECT
    p.run_id,
    p.round,
    p.video_version,
    COUNT(*)                                                         AS residents,
    ROUND(100.0 * AVG(CASE WHEN p.left_at IS NULL OR p.left_at > 3 THEN 1 ELSE 0 END)) AS hook_hold_pct,
    ROUND(100.0 * AVG(CASE WHEN p.left_at IS NOT NULL THEN 1 ELSE 0 END))              AS scrolled_pct,
    ROUND(100.0 * AVG(CASE WHEN p.left_at IS NULL THEN 1 ELSE 0 END))                  AS watched_pct,
    ROUND(100.0 * AVG(p.engaged))                                                      AS engaged_pct,
    ROUND(100.0 * AVG(p.shared))                                                       AS shared_pct,
    COALESCE(MAX(w.came_back_via_share), 0)                                            AS came_back_via_share
FROM per_resident p
LEFT JOIN rewatches w USING (run_id)
GROUP BY p.run_id, p.round, p.video_version
