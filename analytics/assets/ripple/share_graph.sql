/* @bruin
name: ripple.share_graph
type: duckdb.sql
materialization:
  type: table
depends:
  - raw.events
@bruin */

-- Who shared into which community, and how many friends came back because of it.
WITH ripples AS (
    SELECT run_id, actor_id AS sharer_id, actor_name AS sharer, community,
           TRY_CAST(value AS INTEGER) AS community_size, reason
    FROM raw.events
    WHERE type = 'ripple'
),
second_chances AS (
    SELECT run_id, target_id AS sharer_id, community,
           COUNT(*) FILTER (WHERE action = 'rewatch') AS came_back,
           COUNT(*) AS asked
    FROM raw.events
    WHERE type = 'second_chance'
    GROUP BY run_id, target_id, community
)
SELECT r.*, COALESCE(s.asked, 0) AS friends_asked, COALESCE(s.came_back, 0) AS friends_came_back
FROM ripples r
LEFT JOIN second_chances s USING (run_id, sharer_id, community)
