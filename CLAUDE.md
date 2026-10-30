# Rules for Claude agents working in this repository

These rules apply to every task, however small: code, docs, config or CI.

## 1. Branches

- **`main` is the default branch.** It only changes through merged pull requests.
- **Never commit or push directly to `main`.** Never force-push to it, never rewrite its history.
- **Every task gets its own feature branch, created from the latest `main`:**
  ```bash
  git fetch origin main
  git checkout -b claude/<short-kebab-description> origin/main
  ```
  If the session already assigned you a `claude/...` branch, use that name. Otherwise pick a short descriptive one
  (`claude/add-boss-fights`, `claude/fix-terrain-seams`).
- **One task per branch.** Don't bundle unrelated changes; open a separate branch and PR for them.
- **Never reuse a branch whose PR was merged or closed.** Follow-up work starts on a new branch from the latest `main`.
- Keep the branch current by **merging** `origin/main` into it when needed. Don't rebase or force-push a branch that
  already has a PR open.

## 2. Before you push

Run the same checks CI runs and make sure they pass:

```bash
npm ci
npm run check   # syntax check
npm run build   # offline-ready dist/
npm test        # headless smoke test of dist/
```

If you changed gameplay or visuals, also look at it running (`npm run serve`, or the headless smoke test) and say
in the PR what you checked. Commit with clear messages: a short summary line, then what changed and why.

## 3. Pull requests

- **Every change is evaluated through a pull request into `main`.** Push the branch and open the PR yourself. Don't
  leave the work sitting on a branch.
- Fill in the PR template (`.github/pull_request_template.md`): what changed, why, how it was tested, and anything
  the reviewer should look at closely. Include screenshots for visible changes.
- Keep the PR focused and reviewable. If it grows too large, split it.
- More commits pushed to the branch update the open PR. Don't open a second PR for the same branch.

## 4. When a task is done

A task is **not complete** until both of these are true:

1. **The PR exists and its CI is green.** If CI fails, fix it on the same branch and push again. Never skip, disable
   or weaken a test to make CI pass.
2. **A human has decided:** they **approved** the PR (and it was merged), or they **closed/cancelled** it.

Until then the task stays open:

- Watch the PR. Respond to every review comment: either push a fix or reply explaining why not.
- Keep the PR mergeable (resolve conflicts by merging `main` in).
- When you report back to the user, give the PR link and its state (CI status, waiting on review, changes
  requested...). Never describe work as "done" while it is only on a branch or the PR is still open.

## 5. Things agents never do

- Approve or merge their own PR, or merge any PR without a human's approval.
- Push to `main`, force-push shared branches, or change branch protection / repository settings.
- Reopen a PR a human closed, or re-submit the same change, unless the human asks.
- Delete branches, tags or releases unless asked to.
- Create release tags (`v*`) by hand unless asked to. Releases come from merges into `main`.

If a rule blocks the task (missing permissions, a failing check that isn't yours, unclear requirements), stop and ask
the human instead of working around it.

## 6. Test preview after every change

The human tests the game in the browser at **https://claude.ai/artifact/6vvTmbwBznvxiT49uftkHL**. Every time you push
code changes (a new PR, or more commits on one), update that preview in the same turn:

1. Run `npm run preview`. It builds `dist/VERSION.json` stamped `<branch>@<commit>` and prints the files map.
2. Publish `index.html` to that same URL with the Artifact tool. Pass the printed map as `files` (it lists every
   `src/*.js` module, so new modules are never left out) and a `label` naming the branch or PR. In a new
   conversation, `read` the artifact once before publishing, so it updates in place instead of making a new one.
3. Give the human the link, and say which branch or PR it shows. The title card shows the build too.

The preview shows the work under review, not necessarily `main`. After a merge, republish from `main` when asked.

## 7. The agent team

Changes can be run through the agent team described in **`docs/agents.md`**: the Orchestrator (`/orchestrate
<request>`, defined in `.claude/skills/orchestrate/SKILL.md`) plans the work and delegates to the Developer, DevOps,
Security and Documenter agents (`.claude/agents/`). The rules above bind every agent. In particular:

- Only the Orchestrator (the main session) commits, pushes, opens PRs and updates the test preview.
- Every change gets a Security review before its PR opens; a BLOCK verdict or a Medium+ finding is fixed first.
- The PR description includes the Security review section.

## Project quick reference

- Landed: a casual Three.js flying game. Plain ES modules in `src/`, no bundler. See `README.md`.
- `window.G` holds the game state in the browser. `G.step(dt)` advances the simulation without rendering, which is
  useful for scripted tests.
- Build & Release: `.github/workflows/build-release.yml` runs check, build and smoke test on every PR into `main`.
  **Every merge into `main` publishes a new versioned GitHub Release** (patch bump; raise `version` in `package.json` for
  minor/major), so a merged PR ships. Pushing a `v*` tag also publishes a release.
