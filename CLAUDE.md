# CLAUDE.md

## Licensing

`LICENSE` covers every file in the repository, so a source file carries no licence header.

---

Tatolab.app is the desktop app for the Tatolab runtime (`tatolabd`). It is a **consumer** of the
runtime: it reads the runtime's local API and runs the runtime it carries as its own child
process, the way an editor runs a language server, and it never grows runtime behaviour of its own. ONE system per concern — extend the existing one, never build
a parallel one. Search first.

## How work happens

- **Work is tracked in Linear**: team Tatolab, issues `TAT-n`, this repository's titled
  `studio:`. Never write a GitHub issue; GitHub Issues is only for outside reports.
- Skills, agents, the repository rules and hooks come from `dev-plugin` in
  [tatolab/tato-plugins-official](https://github.com/tatolab/tato-plugins-official), which
  `.claude/settings.json` enables; change them there, never in this repository.
- Never write documentation, plans or ADRs, and never create Linear projects or milestones; planning happens in Linear, in separate sessions.
- Code is the only source of truth.
