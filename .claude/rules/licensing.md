# Licensing

- Tatolab.app is proprietary (`LICENSE`: all rights reserved). Never suggest an open-source
  licence for it, and never copy its code into `tatolab/streamlib` (BUSL-1.1) or any public repo.
- Every Rust, TypeScript and shell source file starts with (after a `#!` line, if any):

  ```
  // Copyright (c) 2025 Jonathan Fontanez
  // SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary
  ```

  with `#` for shell (an extensionless script counts by its `#!` line); `*.d.ts` declarations are
  exempt, and so is shadcn's MIT code kept as generated: the app's `src/components/ui/` and the
  prototype's `docs/design/src/components/ui/`. `scripts/check-license-headers.sh` enforces it.
- The runtime the app bundles is streamlib's and stays BUSL-1.1; third-party components keep
  their own licences. A new dependency that ships inside the app (a cargo crate, an npm package
  bundled into `dist/`, a font) is named in the PR body with its licence, so the owner sees what
  the app now redistributes.
- Never modify `LICENSE` without explicit approval.
