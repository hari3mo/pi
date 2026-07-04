---
description: Ship verified changes — builder runs lint/build/tests and commits
---
The current working-tree changes have been reviewed and approved. Delegate to the "builder" subagent: $@

Task for the builder: run the project's lint, typecheck, build, and test commands; fix purely mechanical failures; stage precisely and commit with a clear conventional message. No Co-Authored-By trailer. Do not push. Additional instructions: $@

Report back: commands run with pass/fail, mechanical fixes made, commit hash + message, and any escalations that need judgment.
