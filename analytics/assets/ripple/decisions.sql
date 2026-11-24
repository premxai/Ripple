/* @bruin
name: ripple.decisions
type: duckdb.sql
materialization:
  type: table
depends:
  - raw.events
columns:
  - name: action
    type: string
    checks:
      - name: not_null
      - name: accepted_values
        value: ["keep_watching", "scroll", "like", "comment", "share"]
  - name: video_t
    type: double
    checks:
      - name: not_null
@bruin */

-- One row per resident decision at a checkpoint.
SELECT
    event_id,
    run_id,
    TRY_CAST("round" AS INTEGER)       AS round,
    video_version,
    TRY_CAST(ts AS TIMESTAMP)          AS ts,
    actor_id                       AS resident_id,
    actor_name                     AS resident,
    model,
    lab,
    action,
    TRY_CAST(video_t AS DOUBLE)        AS video_t,
    reason,
    NULLIF(community, '')          AS shared_to,
    TRY_CAST(latency_ms AS INTEGER)    AS latency_ms,
    TRY_CAST(fallback AS BOOLEAN)      AS used_fallback
FROM raw.events
WHERE type = 'decision'
