// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

//! The remembered "Run Tatolab" switch: one JSON file in the app's config directory, on when the
//! file is absent or unreadable.

use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

/// The file the switch is remembered in, inside the app's config directory.
pub const RUN_TATOLAB_PREFERENCE_FILE_NAME: &str = "run-tatolab.json";

#[derive(Debug, Serialize, Deserialize)]
struct RunTatolabPreferenceFileContents {
    run_tatolab: bool,
}

/// Reads and writes the remembered "Run Tatolab" switch at one path.
#[derive(Debug, Clone)]
pub struct RunTatolabPreferenceFile {
    preference_file_path: PathBuf,
}

impl RunTatolabPreferenceFile {
    /// The preference file inside `app_config_directory`.
    pub fn in_app_config_directory(app_config_directory: &Path) -> Self {
        Self {
            preference_file_path: app_config_directory.join(RUN_TATOLAB_PREFERENCE_FILE_NAME),
        }
    }

    /// The remembered switch; on when nothing was remembered or the file cannot be read.
    pub fn load_run_tatolab(&self) -> bool {
        let contents = match std::fs::read(&self.preference_file_path) {
            Ok(contents) => contents,
            Err(failure) if failure.kind() == std::io::ErrorKind::NotFound => return true,
            Err(failure) => {
                tracing::warn!(
                    path = %self.preference_file_path.display(),
                    %failure,
                    "the Run Tatolab preference could not be read; treating it as on"
                );
                return true;
            }
        };
        match serde_json::from_slice::<RunTatolabPreferenceFileContents>(&contents) {
            Ok(remembered) => remembered.run_tatolab,
            Err(failure) => {
                tracing::warn!(
                    path = %self.preference_file_path.display(),
                    %failure,
                    "the Run Tatolab preference is malformed; treating it as on"
                );
                true
            }
        }
    }

    /// Remember the switch, replacing the file whole so a crash never leaves half of it.
    pub fn save_run_tatolab(&self, run_tatolab: bool) -> std::io::Result<()> {
        if let Some(parent_directory) = self.preference_file_path.parent() {
            std::fs::create_dir_all(parent_directory)?;
        }
        let serialized =
            serde_json::to_vec_pretty(&RunTatolabPreferenceFileContents { run_tatolab })
                .map_err(std::io::Error::other)?;
        let partially_written_path = self.preference_file_path.with_extension("json.partial");
        std::fs::write(&partially_written_path, serialized)?;
        std::fs::rename(&partially_written_path, &self.preference_file_path)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_switch_is_on_when_nothing_was_remembered() {
        let config_directory = tempfile::tempdir().unwrap();
        let preference =
            RunTatolabPreferenceFile::in_app_config_directory(&config_directory.path().join("new"));
        assert!(preference.load_run_tatolab());
    }

    #[test]
    fn the_switch_is_remembered_off_and_on_across_loads() {
        let config_directory = tempfile::tempdir().unwrap();
        let app_config_directory = config_directory.path().join("com.tatolab.tatolab");
        let preference = RunTatolabPreferenceFile::in_app_config_directory(&app_config_directory);

        preference.save_run_tatolab(false).unwrap();
        assert!(
            !RunTatolabPreferenceFile::in_app_config_directory(&app_config_directory)
                .load_run_tatolab()
        );
        assert_eq!(
            std::fs::read_to_string(app_config_directory.join(RUN_TATOLAB_PREFERENCE_FILE_NAME))
                .unwrap()
                .replace([' ', '\n'], ""),
            r#"{"run_tatolab":false}"#
        );

        preference.save_run_tatolab(true).unwrap();
        assert!(preference.load_run_tatolab());
    }

    #[test]
    fn a_malformed_file_reads_as_on() {
        let config_directory = tempfile::tempdir().unwrap();
        std::fs::write(
            config_directory
                .path()
                .join(RUN_TATOLAB_PREFERENCE_FILE_NAME),
            b"not json",
        )
        .unwrap();
        assert!(
            RunTatolabPreferenceFile::in_app_config_directory(config_directory.path())
                .load_run_tatolab()
        );
    }
}
