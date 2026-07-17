# Task Completion

- Run the task-specific lint, type-check, and tests declared by live project manifests; no application commands are currently defined, so do not invent them.
- Inspect the final diff and working-tree status; preserve unrelated changes.
- Run the Trellis quality workflow before completion and update executable specs when stable conventions were learned.
- Bootstrap-guidelines task: every checked item must contain real, non-placeholder guidance and real examples; then run `python3 ./.trellis/scripts/task.py finish` and `python3 ./.trellis/scripts/task.py archive 00-bootstrap-guidelines`.
- Do not mark a task complete merely because planning or scaffolding exists.