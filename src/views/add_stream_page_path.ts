// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

import type { AddStreamSource } from "../presentation/add_stream_flow";

/** The path of the Add stream page starting from `source`. */
export function addStreamPagePath(source: AddStreamSource): string {
  return source === "new_project" ? "/add-stream/new-project" : "/add-stream";
}
