// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary
// Adapted from shadcn/ui (MIT): public/licenses/shadcn-ui-MIT.txt.

import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** The class names given, joined, with a later Tailwind utility winning over an earlier one it conflicts with. */
export function joinClassNames(...classNames: ClassValue[]): string {
  return twMerge(clsx(classNames));
}
