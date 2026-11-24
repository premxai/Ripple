/* @bruin
name: ripple.opinions_by_model
type: duckdb.sql
materialization:
  type: table
depends:
  - ripple.decisions
@bruin */

-- How each AI lab's resident reacted. Shows the town isn't one model agreeing with itself.
SELECT
    run_id,
    lab,
    model,
    COUNT(*)                                              AS decisions,
    COUNT(*) FILTER (WHERE action = 'scroll')             AS scrolls,
    COUNT(*) FILTER (WHERE action IN ('like', 'comment', 'share')) AS positive,
    ROUND(AVG(latency_ms))                                AS avg_latency_ms,
    COUNT(*) FILTER (WHERE used_fallback)                 AS fallbacks
FROM ripple.decisions
GROUP BY run_id, lab, model
ORDER BY run_id, scrolls DESC
