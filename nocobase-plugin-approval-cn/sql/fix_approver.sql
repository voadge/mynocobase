WITH target_nodes AS (
  SELECT fn.id
  FROM "flow_nodes" fn,
       jsonb_each((fn.config->'forms')::jsonb) AS fk(key, val),
       jsonb_array_elements(fk.val->'actions') WITH ORDINALITY AS fa(act, idx)
  WHERE fk.key = 'oyhs6ex3tj0'
    AND fa.act->>'key' = 'hv81dnb4xcn'
    AND NOT (fa.act->'values' ? 'approver')
),
update_paths AS (
  SELECT fn.id, fk.key AS form_key, (fa.idx - 1)::int AS act_idx
  FROM "flow_nodes" fn,
       jsonb_each((fn.config->'forms')::jsonb) AS fk(key, val),
       jsonb_array_elements(fk.val->'actions') WITH ORDINALITY AS fa(act, idx)
  WHERE fn.id IN (SELECT id FROM target_nodes)
    AND fk.key = 'oyhs6ex3tj0'
    AND fa.act->>'key' = 'hv81dnb4xcn'
)
UPDATE "flow_nodes" SET config = jsonb_set(
  (config)::jsonb,
  ('{forms,' || up.form_key || ',actions,' || up.act_idx || ',values}')::text[],
  ((config->'forms'->up.form_key->'actions'->up.act_idx->'values')::jsonb || '{"approver": "{{$user.nickname}}"}')::jsonb
)::json
FROM update_paths up
WHERE "flow_nodes".id = up.id;

SELECT fn.id, fa.act->>'key' AS act_key, fa.act->'values' AS values
FROM "flow_nodes" fn,
     jsonb_each((fn.config->'forms')::jsonb) AS fk(key, val),
     jsonb_array_elements(fk.val->'actions') AS fa(act)
WHERE fk.key = 'oyhs6ex3tj0' AND fa.act->>'key' = 'hv81dnb4xcn'
ORDER BY fn.id;
