// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

/**
 * The 3 px focus ring at the `ring` token's own strength, 3:1 against window and well. Stock shadcn draws
 * `ring-ring/50` (and a destructive control `ring-destructive/20`, `/40` in dark), which fall under that; a later class
 * of the same kind, theme prefix included, replaces each when the classes are merged.
 */
export const FULL_STRENGTH_FOCUS_RING_CLASS_NAMES =
  "focus-visible:ring-3 focus-visible:ring-ring focus-visible:border-transparent dark:focus-visible:ring-ring dark:focus-visible:border-transparent";
