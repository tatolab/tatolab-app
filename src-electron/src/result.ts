// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

// Rust's Result for the main process: a failure is a value the caller handles, never a throw.

/** A value, or the failure that stopped it. */
export type Result<T, F> = { ok: true; value: T } | { ok: false; failure: F };

/** A result holding `value`. */
export function succeeded<T>(value: T): { ok: true; value: T } {
  return { ok: true, value };
}

/** A result holding `failure`. */
export function failedWith<F>(failure: F): { ok: false; failure: F } {
  return { ok: false, failure };
}

/** What a caught exception says, for a failure value made at the edge where the OS or Electron throws. */
export function describeCaughtFailure(caughtFailure: unknown): string {
  return caughtFailure instanceof Error ? caughtFailure.message : String(caughtFailure);
}
