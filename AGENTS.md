# Repository Guidelines

## Project Structure & Module Organization

`umaxica-apps-edge-away` is described in `README.md` as a cushion page for the Umaxica project. The repository currently contains:

- `README.md`: project name and purpose.
- `LICENSE`: MIT license terms.
- `.gitignore`: dependency, build, cache, log, and environment-file exclusions.

There are no source, test, or asset directories yet. When introducing the application, document its directory layout in `README.md` and keep source code, tests, and static assets clearly separated. The ignore rules do not establish a framework or package manager.

## Build, Test, and Development Commands

No dependency manifest, build scripts, development server, or test runner is configured. Do not assume commands such as `npm test` or `npm run build` work.

Current repository checks:

- `git status --short`: inspect pending changes before and after editing.
- `git diff --check`: check tracked changes for whitespace errors.
- `git diff`: review tracked changes; inspect newly created files separately.

When adding tooling, document installation, local development, build, and test commands in `README.md`, and commit the chosen package manager's lockfile.

## Coding Style & Naming Conventions

No language-specific style, formatter, or linter is established. Keep Markdown concise, use descriptive headings, and format commands and paths with backticks. Use two spaces for nested Markdown list indentation. Choose descriptive filenames and follow the conventions of the framework once selected; introduce formatting configuration alongside the first application code.

## Testing Guidelines

There is no testing framework or coverage threshold. For documentation changes, check command accuracy, paths, and Markdown rendering. When adding executable behavior, include appropriate tests and document the runner, test locations, filename convention, and execution command.

## Commit & Pull Request Guidelines

Git history contains only `Initial commit`, so no recurring commit convention is established. Use concise, imperative subjects, such as `Add cushion page layout`, and keep commits focused.

Pull requests should explain the purpose, summarize changes, link relevant issues, and state validation performed or unavailable. Include screenshots for visible page changes once a UI exists.

## Security & Configuration

Never commit credentials or real environment values. `.gitignore` excludes `.env` and `.env.*` while allowing `.env.example`; use that file only for safe placeholders and document required variables when configuration is introduced.
