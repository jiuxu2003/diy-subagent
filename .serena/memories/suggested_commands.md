# Suggested Commands

- Session context: `python3 ./.trellis/scripts/get_context.py`
- Workflow phase index: `python3 ./.trellis/scripts/get_context.py --mode phase`
- Step detail: `python3 ./.trellis/scripts/get_context.py --mode phase --step <step> --platform codex`
- Package/spec discovery: `python3 ./.trellis/scripts/get_context.py --mode packages`
- Current task query: `python3 ./.trellis/scripts/task.py current`
- Repository state review: `git status --short`
- Serena memory reference audit after memory edits: `serena memories check`
- No application dev/lint/test/type-check command is defined yet; derive commands from live manifests when they appear.