Merge, build, commit, push, update docs if needed, and restart all Enso services.

> **⛔ This command must ONLY be run by the user (via `/enso-deploy`), NEVER by an automated fix session.** If you are fixing a bug or making a code change as part of an auto-repair, debug reporter, or fix_with_code flow — do NOT run this command. Just fix the code and stop.

## Steps

1. **Merge worktree to main**: If we're on a worktree branch (not `main`), merge the current branch into `main` using `git merge <branch> --no-edit` from the main repo at `D:\Github\Enso`. If already on main, skip.

2. **Build**: Run `npm run build` from `D:\Github\Enso` to produce the production frontend bundle.

3. **Assess whether docs need updating**: Review the recent commits (`git log main -10 --oneline`) and the conversation context. Determine if a **major feature or design change** was introduced — something that materially changes what the project does or how it presents itself. Minor fixes, refactors, and small tweaks do NOT require doc updates.

   Examples that warrant doc updates:
   - New built-in app or tool family added
   - Major new capability (e.g. live sharing, voice input, mobile app support)
   - Fundamental architecture change
   - New user-facing workflow or integration

   Examples that do NOT:
   - Bug fixes, style tweaks, performance improvements
   - Internal refactors that don't change user-facing behavior
   - Adding a button or fixing a dialog

4. **Update docs** (only if step 3 determined it's needed): Review and update the following files as needed to reflect the new capability. Keep changes concise — add or revise only what's relevant to the new feature, don't rewrite unrelated sections.

   - **`README.md`** — Update the Features list, Built-in Apps section, or tagline if the change is significant enough. Add a new subsection under Built-in Apps if a new app was added. Update the features bullet list if a new major capability was introduced.
   - **`package.json`** `description` field — Only if the project's one-liner description no longer captures what the project does.
   - **GitHub repo description** — Run `gh repo edit --description "..."` only if the package.json description changed.
   - **`CLAUDE.md`** — Update the Vision, Key Concepts, or Architecture sections only if the change affects how developers should understand the codebase. Keep in sync with the main repo copy at `D:\Github\Enso\CLAUDE.md` (worktree copies are symlinked/mirrored automatically).

5. **Commit** (if needed): On the `main` branch at `D:\Github\Enso`, check `git status` for any uncommitted changes (build output, doc updates). If there are changes, stage and commit them. Use a commit message like `docs: update README/description for <feature>` if docs changed, or a short descriptive message for build-only changes.

6. **Push**: Run `git push` from `D:\Github\Enso` to push main to the remote.

7. **Restart services**: Run `powershell -ExecutionPolicy Bypass -File D:\Github\Enso\restart.ps1` to kill and restart the OpenClaw gateway + Vite dev server.

Report the result of each step. If any step fails, stop and report the error.
