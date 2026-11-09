# Licensing

- Tatolab.app is dual-licensed (`LICENSE`): AGPL-3.0-only, or a commercial licence from the
  copyright holder. `LICENSE` covers every file in the repository, so a source file carries no
  licence header of its own. Never suggest another licence for it, never drop the commercial
  option, and never copy its code into `tatolab/streamlib` (BUSL-1.1).
- The runtime the app bundles is streamlib's and stays BUSL-1.1; third-party components keep
  their own licences, shadcn's generated components in `apps/tato-app/src/renderer/components/ui/`
  their MIT form. A new dependency that ships inside the app (an npm package bundled into
  `apps/tato-app/out/renderer/`, a font) is named in the PR body with its licence, so the owner sees what the app
  now redistributes.
- Never modify `LICENSE` without explicit approval.
