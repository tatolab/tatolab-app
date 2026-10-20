# Naming

Names must be understood with zero context — someone reading the name 200 lines from its
declaration knows exactly what it is and where its data comes from / goes to. **Never suggest a
shorter name; suggest a more explicit one.** Explicit beats short, always.

- Encode role + subject + direction: what it reads, what it shows, where it sends.
- No bare generic words: never just `Manager`, `Handler`, `Service`, `State`, `Data`, `ctx`,
  `buf`, `el`, `cb`, `res`.
- Files are named for the one thing they hold, in `snake_case`, in both Rust and TypeScript
  (`stream_log_follower.ts`, `run_tatolab_switch.rs`).
- A platform item names the mechanism it drives (`ServiceManagementRuntimeLaunchAgent`,
  `SystemdUserRuntimeService`), never `MacImpl` / `LinuxBackend`.
- CSS classes name what the element is in the window, not how it looks.

Validated examples from this tree (do not shorten): `TatolabStatusPublisher`,
`RuntimeAgentRegistration`, `TatolabMachineSetup`, `lock_ignoring_poison`,
`ConditionOnsetLatch`, `stream_log_records_page_from_the_logs_tool_result`,
`readTatolabFrontendFeatureFlags`, `driveMockWindowToPreset`. A 50-character name is fine.
