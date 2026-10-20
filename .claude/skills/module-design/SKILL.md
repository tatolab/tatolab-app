---
name: module-design
description: Design vocabulary and procedure for new or reshaped modules, traits, Tauri commands and backend contracts in the app — before writing them. Use when designing any trait, module, platform item, Tauri command, TypeScript backend contract or view seam, or when comparing alternative shapes for one.
---

# Module design

Vocabulary — use exactly these terms: **module** (anything with an interface and an
implementation), **interface** (everything a caller must know: signature plus invariants,
ordering, error modes, threading), **depth** (behaviour gained per unit of interface learned),
**seam** (a place behaviour can change without editing there), **adapter**, **locality** (what
maintainers get), **leverage** (what callers get). Never "component", "service", or "boundary".

Procedure:

1. **Search first.** Prove nothing already covers the concern: the platform traits
   (`RuntimeAgentRegistration`, `TatolabMachineSetup`) and items in `platform/`, `LocalApiClient`,
   `TatolabStatusPublisher` and the status model, the Tauri commands in `tatolab_commands.rs`, the
   `TatolabBackend` contract and its two implementations, the presentation functions. Extending
   beats parallel — always.
2. **Design it twice.** Spawn parallel design subagents with different constraints — minimize the
   interface / optimize for the dominant caller / ports-and-adapters. Each returns: the interface,
   a usage example, what's hidden, the error taxonomy (including what the window shows for each
   error), trade-offs.
3. **Compare** on depth, locality, and seam placement. Give ONE opinionated recommendation — never
   a menu.
4. A shape that needs something new from the runtime goes to streamlib as an issue the app waits
   on; any other shape goes in the issue's Design section before `/implement`.

Testing stance: **the interface is the test surface.** Wanting to test past it means the module is
the wrong shape. Every OS side effect sits behind a seam a test fakes. One adapter is a
hypothetical seam; two (macOS and Linux, or Tauri and mock) is a real one.
