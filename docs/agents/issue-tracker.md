# Issue tracker: GitHub

Issues and specs live in GitHub Issues for `adrienZ/slopstagram`.
Use the `gh` CLI from this repository.

- Read: `gh issue view <number> --json number,title,body,labels,comments`.
- List: `gh issue list --state open`, with appropriate label filters.
- Create: `gh issue create --title "..." --body-file <file>`.
- Update: `gh issue edit <number> --body-file <file>`.
- Comment: `gh issue comment <number> --body-file <file>`.
- Label: `gh issue edit <number> --add-label "..."` or `--remove-label "..."`.
- Close: `gh issue close <number>`.

Write multiline bodies to temporary files before passing `--body-file`.

“Publish to the issue tracker” means create a GitHub issue.
“Fetch the relevant ticket” means read its issue and comments.

## Pull requests as a triage surface

PRs as a request surface: no.

## Wayfinding

Keep the map in an issue labelled `wayfinder:map`, with Notes,
Decisions-so-far, and Fog sections. Link child tickets as GitHub
sub-issues; where unavailable, use a task list in the map and
`Part of #<map>` in each child.

Label children `wayfinder:<type>` where type is research, prototype,
grilling, or task. Track blockers with native GitHub issue dependencies;
where unavailable, use `Blocked by: #<number>` in the child.

Choose the first open, unassigned child in map order with no open
blockers. Claim it by assigning yourself. On resolution, record the
answer, close the child, and add a summary and link to Decisions-so-far.
