// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

fn main() {
    tauri::Builder::default()
        .run(tauri::generate_context!())
        .expect("Tatolab failed to start");
}
