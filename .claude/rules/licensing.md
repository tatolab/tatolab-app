# Licensing

- Tatolab.app is proprietary (`LICENSE`: all rights reserved), and `LICENSE` covers every file in
  the repository, so a source file carries no licence header of its own. Never suggest an
  open-source licence for it, and never copy its code into `tatolab/streamlib` (BUSL-1.1) or any
  public repo.
- The runtime the app bundles is streamlib's and stays BUSL-1.1; third-party components keep
  their own licences, shadcn's generated components in `src/renderer/components/ui/` their MIT
  form. A new dependency that ships inside the app (an npm package bundled into `out/renderer/`, a
  font) is named in the PR body with its licence, so the owner sees what the app now
  redistributes.
- Never modify `LICENSE` without explicit approval.
