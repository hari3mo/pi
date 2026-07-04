# Graph Maintenance Runbook (graphify-out/)

Operational canon for the harness knowledge graph. Distilled from the failures of
2026-07-04 — each rule below was learned by breaking the graph once.

## Invariants

1. **Never let a rebuild see changed `.md` files.** graphify's structural markdown
   extractor REPLACES the LLM-authored semantic layer for any doc it re-extracts
   (replace-on-re-extract). The post-commit hook filters doc extensions before
   rebuilding (guarded by `validate-config.py`); manual `_rebuild_code` calls must
   pass an explicit code-only `changed_paths` list:
   `_rebuild_code(root, changed_paths=[Path(f) for f in detect(root)['files']['code']])`.
   Observed failure: 22 semantic edges lost, giant component 615→126.
2. **Drive `graphify.extract()` from a real `.py` file with an
   `if __name__ == "__main__":` guard.** It uses multiprocessing spawn; stdin
   heredocs or unguarded scripts silently kill every TS/JS extraction worker while
   non-parallel extractors still succeed (symptom: node count halves, no error).
3. **After editing any doc with LLM-authored semantics, re-bind its cache entry.**
   The semantic cache is content-keyed: an edit orphans the entry and the next doc
   rebuild silently drops that doc's semantics. Re-bind by pulling the doc's
   nodes/edges from `graph.json` and calling `save_semantic_cache(nodes, edges, [],
   root='.')`. The `--full` pipeline audit reports drift.
4. **Semantic edges live in the cache, not just `graph.json`.** Hand-patched edges
   added directly to `graph.json` do not survive regeneration; author them into the
   semantic layer and re-save the cache.

## Regeneration (cheap — cache makes it LLM-free)

Full rebuild from caches: detect → AST extract (real file, `__main__` guard) →
`check_semantic_cache` (all unchanged docs hit) → merge → `build_from_json` →
cluster → `to_json` → report. The `to_json` shrink-guard refuses to write a smaller
graph; when the shrink is intentional (corruption cleanup, deleted files), delete
`graph.json` first — a backup lands in `graphify-out/<date>/` on every cluster-only run.

## Health signals

- `scripts/audit-pipelines.py`: connectivity ratchet (best-ever giant fraction in
  `.pipeline_baseline.json`; >20% drop = ERROR), freshness vs last code commit,
  `needs_update` staleness, cache drift (`--full`).
- `graphify-out/needs_update`: doc semantics stale → `/graphify --update`.
- Post-commit hook rebuilds code automatically; docs only ever flag.
