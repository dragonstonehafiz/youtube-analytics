# Agents Playbook

This repository uses Python CLI agents/scripts to interact with the YouTube APIs. To keep
the tooling consistent, follow these conventions when introducing or updating scripts.

## Naming & layout

- Use snake_case filenames that describe the dataset they emit (e.g. `daily_analytics.py`, `video_data.py`).
- Place every CLI script that produces a CSV artifact inside `src/cli-scripts/`.
- Shared helper modules (anything not directly writing CSVs) live in `src/utils/` and must be importable.
- Keep configuration (SCOPES, credential paths, data directory, etc.) in `src/utils/config.py`.

## CLI arguments

- Parse arguments with `argparse.ArgumentParser`.
- Prefer explicit, long-form flags (`--start-date`, `--full-history`, `--output`).
- Provide defaults where sensible (e.g. default output paths under `data/`).
- Validate incompatible flag combinations early and exit with a helpful error.
- When adding new flags, document them in `README.md` and within the script’s description.

## Auth & configuration

- Import OAuth constants from `utils.config`.
- Reuse `utils.auth.get_credentials` and other helper modules rather than duplicating logic.

## Output conventions

- CSV outputs live under `data/` by default; create the directory if needed.
- Default filenames must start with the script name (e.g. `daily_analytics_<...>.csv`,
  `video_data_<...>.csv`). Append date ranges or timestamps after the script name when
  needed to convey context.
- When no explicit date range is provided, bake the execution date/time into the filename
  (e.g. `daily_analytics_<timestamp>.csv` or `video_data_<timestamp>.csv`) so files show
  when the data was pulled.
- Always allow `--output` overrides for custom destinations.

## Messaging & logging

- Print high-level progress (`Found N uploads…`, `Saved X rows…`).
- Send warnings/errors to stderr when possible so automation can route them.

## Error handling

- Catch `HttpError` where API calls are made; surface concise error messages.
- Consider retries for transient server errors (see `execute_with_retry`).

Following these guidelines keeps each agent predictable and lets other contributors
quickly understand and reuse new scripts.
