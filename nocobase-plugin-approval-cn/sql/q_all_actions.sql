SELECT fn.id AS node_id,
       w.id AS workflow_id,
       w.enabled::text AS enabled,
       fn.title AS node_title,
       fkf.key AS form_key,
       fkf.value->>'collection' AS collection,
       fak->>'key' AS act_key,
       (fak->>'status') AS act_status,
       fak->'values' AS act_values
FROM "flow_nodes" fn
JOIN "workflows" w ON w.id = fn."workflowId"
CROSS JOIN LATERAL jsonb_each(fn.config::jsonb->'forms') AS fkf(key, value)
CROSS JOIN LATERAL jsonb_array_elements(fkf.value->'actions') AS fak
WHERE fn.type = 'manual'
ORDER BY w.id, fn.id;