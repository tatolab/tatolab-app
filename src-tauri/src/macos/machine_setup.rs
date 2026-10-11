// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

//! First-launch machine setup: the machine runtime lock `tatolabd` refuses to start without, and
//! the PATH link to the bundled CLI. A real build creates whatever is missing behind one
//! administrator prompt; a local-proof build prepares its test root with no prompt.

use std::os::unix::fs::{MetadataExt, OpenOptionsExt, PermissionsExt};
use std::path::{Path, PathBuf};
use std::process::Command;

use crate::macos::tatolab_machine_paths::TatolabMachinePaths;

/// The lock directory's mode: every user traverses it to open the lock file, only its owner
/// writes it. `tatolabd` refuses a directory a group or other can write.
const MACHINE_RUNTIME_LOCK_DIRECTORY_MODE: u32 = 0o755;

/// The lock file's mode, exactly: whichever user's runtime starts first takes it.
const MACHINE_RUNTIME_LOCK_FILE_MODE: u32 = 0o666;

/// The bits that let a group or other replace an entry in a directory.
const GROUP_AND_OTHER_WRITE_BITS: u32 = 0o022;

/// The interpreter that shows macOS's administrator prompt.
const OSASCRIPT_PATH: &str = "/usr/bin/osascript";

/// The words the administrator prompt shows under "Tatolab wants to make changes."
const ADMINISTRATOR_PROMPT_TEXT: &str = "Tatolab needs to create the machine runtime lock and \
     link the tatolab command so the runtime can start.";

/// One machine-wide piece first-launch setup still has to create or correct.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum MissingMachineSetupPiece {
    /// The lock's directory is absent, or not a directory its owner alone can write.
    MachineRuntimeLockDirectory { path: PathBuf },
    /// The lock file is absent, or not a regular file its owner owns at exactly 0666.
    MachineRuntimeLockFile { path: PathBuf },
    /// The PATH link is absent or points somewhere other than this bundle's CLI.
    CommandLineToolLink {
        link_path: PathBuf,
        bundled_command_line_tool: PathBuf,
    },
}

impl MissingMachineSetupPiece {
    /// The path this piece lives at, as the status lists it.
    pub fn path(&self) -> &Path {
        match self {
            MissingMachineSetupPiece::MachineRuntimeLockDirectory { path }
            | MissingMachineSetupPiece::MachineRuntimeLockFile { path } => path,
            MissingMachineSetupPiece::CommandLineToolLink { link_path, .. } => link_path,
        }
    }
}

/// Every piece of machine setup that is missing or wrong for `paths`, given the CLI this bundle
/// carries (none outside a bundle, which links nothing).
pub fn missing_machine_setup_pieces(
    paths: &TatolabMachinePaths,
    bundled_command_line_tool: Option<&Path>,
) -> Vec<MissingMachineSetupPiece> {
    let expected_owner_uid = paths.machine_runtime_lock_owner.uid();
    let mut missing = Vec::new();
    if !is_a_trusted_lock_directory(&paths.machine_runtime_lock_directory, expected_owner_uid) {
        missing.push(MissingMachineSetupPiece::MachineRuntimeLockDirectory {
            path: paths.machine_runtime_lock_directory.clone(),
        });
    }
    if !is_a_trusted_lock_file(&paths.machine_runtime_lock_file, expected_owner_uid) {
        missing.push(MissingMachineSetupPiece::MachineRuntimeLockFile {
            path: paths.machine_runtime_lock_file.clone(),
        });
    }
    if let (Some(link_path), Some(bundled_command_line_tool)) =
        (&paths.command_line_tool_link, bundled_command_line_tool)
    {
        if command_line_tool_link_target(link_path).as_deref() != Some(bundled_command_line_tool) {
            missing.push(MissingMachineSetupPiece::CommandLineToolLink {
                link_path: link_path.clone(),
                bundled_command_line_tool: bundled_command_line_tool.to_path_buf(),
            });
        }
    }
    missing
}

/// The PATH link when it points at `bundled_command_line_tool`.
pub fn command_line_tool_linked_at(
    paths: &TatolabMachinePaths,
    bundled_command_line_tool: Option<&Path>,
) -> Option<PathBuf> {
    let link_path = paths.command_line_tool_link.as_ref()?;
    let bundled_command_line_tool = bundled_command_line_tool?;
    (command_line_tool_link_target(link_path).as_deref() == Some(bundled_command_line_tool))
        .then(|| link_path.clone())
}

fn command_line_tool_link_target(link_path: &Path) -> Option<PathBuf> {
    std::fs::read_link(link_path).ok()
}

fn is_a_trusted_lock_directory(path: &Path, expected_owner_uid: u32) -> bool {
    std::fs::symlink_metadata(path).is_ok_and(|metadata| {
        metadata.file_type().is_dir()
            && metadata.uid() == expected_owner_uid
            && metadata.mode() & GROUP_AND_OTHER_WRITE_BITS == 0
    })
}

fn is_a_trusted_lock_file(path: &Path, expected_owner_uid: u32) -> bool {
    std::fs::symlink_metadata(path).is_ok_and(|metadata| {
        metadata.file_type().is_file()
            && metadata.uid() == expected_owner_uid
            && metadata.mode() & 0o7777 == MACHINE_RUNTIME_LOCK_FILE_MODE
    })
}

/// `value` as one single-quoted POSIX shell word.
fn single_quoted_shell_word(value: &str) -> String {
    format!("'{}'", value.replace('\'', r"'\''"))
}

fn shell_word_for_path(path: &Path) -> String {
    single_quoted_shell_word(&path.to_string_lossy())
}

/// The one root shell script that creates or corrects every piece in `missing`, each step joined
/// so the first failure stops the rest.
pub fn machine_setup_administrator_shell_script(missing: &[MissingMachineSetupPiece]) -> String {
    let mut steps = Vec::new();
    for piece in missing {
        match piece {
            MissingMachineSetupPiece::MachineRuntimeLockDirectory { path } => {
                let directory = shell_word_for_path(path);
                steps.push(format!("if [ -L {directory} ]; then rm -f {directory}; fi"));
                steps.push(format!("mkdir -p {directory}"));
                steps.push(format!("chown root:wheel {directory}"));
                steps.push(format!(
                    "chmod {MACHINE_RUNTIME_LOCK_DIRECTORY_MODE:04o} {directory}"
                ));
            }
            MissingMachineSetupPiece::MachineRuntimeLockFile { path } => {
                let file = shell_word_for_path(path);
                steps.push(format!("if [ -L {file} ]; then rm -f {file}; fi"));
                steps.push(format!("touch {file}"));
                steps.push(format!("chown root:wheel {file}"));
                steps.push(format!("chmod {MACHINE_RUNTIME_LOCK_FILE_MODE:04o} {file}"));
            }
            MissingMachineSetupPiece::CommandLineToolLink {
                link_path,
                bundled_command_line_tool,
            } => {
                if let Some(link_directory) = link_path.parent() {
                    steps.push(format!("mkdir -p {}", shell_word_for_path(link_directory)));
                }
                steps.push(format!(
                    "ln -sfn {} {}",
                    shell_word_for_path(bundled_command_line_tool),
                    shell_word_for_path(link_path)
                ));
            }
        }
    }
    steps.join(" && ")
}

/// `value` as an AppleScript string literal.
fn applescript_string_literal(value: &str) -> String {
    format!("\"{}\"", value.replace('\\', r"\\").replace('"', "\\\""))
}

/// The AppleScript that runs `shell_script` as root behind the administrator prompt.
pub fn administrator_prompt_applescript(shell_script: &str) -> String {
    format!(
        "do shell script {} with prompt {} with administrator privileges",
        applescript_string_literal(shell_script),
        applescript_string_literal(ADMINISTRATOR_PROMPT_TEXT)
    )
}

/// Create every piece in `missing` behind one administrator prompt, blocking until the user
/// answers it.
pub fn run_machine_setup_behind_one_administrator_prompt(
    missing: &[MissingMachineSetupPiece],
) -> Result<(), String> {
    if missing.is_empty() {
        return Ok(());
    }
    let applescript =
        administrator_prompt_applescript(&machine_setup_administrator_shell_script(missing));
    let osascript_output = Command::new(OSASCRIPT_PATH)
        .arg("-e")
        .arg(applescript)
        .output()
        .map_err(|failure| format!("{OSASCRIPT_PATH} could not be started: {failure}"))?;
    if osascript_output.status.success() {
        return Ok(());
    }
    let osascript_stderr = String::from_utf8_lossy(&osascript_output.stderr);
    if osascript_stderr.contains("(-128)") {
        return Err("the administrator prompt was cancelled".to_string());
    }
    Err(format!(
        "machine setup failed ({}): {}",
        osascript_output.status,
        osascript_stderr.trim()
    ))
}

/// Prepare a local-proof build's test root as the runtime's test build requires it — the lock
/// directory at 0755 and the lock file at exactly 0666, both owned by this user — with no prompt.
pub fn prepare_local_proof_test_machine_root(paths: &TatolabMachinePaths) -> Result<(), String> {
    let expected_owner_uid = paths.machine_runtime_lock_owner.uid();
    let refuse = |path: &Path, what_is_wrong: &str| {
        format!(
            "the local-proof machine root cannot be prepared: {} {what_is_wrong}",
            path.display()
        )
    };
    let lock_directory = &paths.machine_runtime_lock_directory;
    std::fs::create_dir_all(lock_directory)
        .map_err(|failure| refuse(lock_directory, &format!("could not be created ({failure})")))?;
    let lock_directory_metadata = std::fs::symlink_metadata(lock_directory).map_err(|failure| {
        refuse(
            lock_directory,
            &format!("could not be inspected ({failure})"),
        )
    })?;
    if !lock_directory_metadata.file_type().is_dir() {
        return Err(refuse(lock_directory, "is not a real directory"));
    }
    if lock_directory_metadata.uid() != expected_owner_uid {
        return Err(refuse(
            lock_directory,
            &format!("is owned by uid {}", lock_directory_metadata.uid()),
        ));
    }
    std::fs::set_permissions(
        lock_directory,
        std::fs::Permissions::from_mode(MACHINE_RUNTIME_LOCK_DIRECTORY_MODE),
    )
    .map_err(|failure| {
        refuse(
            lock_directory,
            &format!("could not be set to 0755 ({failure})"),
        )
    })?;

    let lock_file = &paths.machine_runtime_lock_file;
    std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .mode(MACHINE_RUNTIME_LOCK_FILE_MODE)
        .custom_flags(libc::O_NOFOLLOW)
        .open(lock_file)
        .map_err(|failure| refuse(lock_file, &format!("could not be created ({failure})")))?;
    let lock_file_metadata = std::fs::symlink_metadata(lock_file)
        .map_err(|failure| refuse(lock_file, &format!("could not be inspected ({failure})")))?;
    if !lock_file_metadata.file_type().is_file() {
        return Err(refuse(lock_file, "is not a regular file"));
    }
    if lock_file_metadata.uid() != expected_owner_uid {
        return Err(refuse(
            lock_file,
            &format!("is owned by uid {}", lock_file_metadata.uid()),
        ));
    }
    // The process umask strips bits from the create mode, so the exact mode is set afterwards.
    std::fs::set_permissions(
        lock_file,
        std::fs::Permissions::from_mode(MACHINE_RUNTIME_LOCK_FILE_MODE),
    )
    .map_err(|failure| refuse(lock_file, &format!("could not be set to 0666 ({failure})")))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::macos::tatolab_machine_paths::{current_process_uid, MachineRuntimeLockOwner};

    fn paths_under(root: &Path) -> TatolabMachinePaths {
        TatolabMachinePaths::under_a_local_proof_test_root(root, current_process_uid())
    }

    fn real_shaped_paths_under(root: &Path) -> TatolabMachinePaths {
        TatolabMachinePaths {
            machine_runtime_lock_owner: MachineRuntimeLockOwner::ThisUser {
                uid: current_process_uid(),
            },
            command_line_tool_link: Some(root.join("bin").join("tatolab")),
            ..paths_under(root)
        }
    }

    #[test]
    fn a_fresh_machine_misses_the_lock_directory_lock_file_and_cli_link() {
        let root = tempfile::tempdir().unwrap();
        let paths = real_shaped_paths_under(root.path());
        let bundled = root.path().join("Tatolab.app/Contents/MacOS/tatolab-cli");

        let missing = missing_machine_setup_pieces(&paths, Some(&bundled));

        assert_eq!(
            missing
                .iter()
                .map(|piece| piece.path().to_path_buf())
                .collect::<Vec<_>>(),
            vec![
                paths.machine_runtime_lock_directory.clone(),
                paths.machine_runtime_lock_file.clone(),
                root.path().join("bin").join("tatolab"),
            ]
        );
        assert_eq!(command_line_tool_linked_at(&paths, Some(&bundled)), None);
    }

    #[test]
    fn outside_a_bundle_no_cli_link_is_required() {
        let root = tempfile::tempdir().unwrap();
        let paths = real_shaped_paths_under(root.path());

        let missing = missing_machine_setup_pieces(&paths, None);

        assert!(missing
            .iter()
            .all(|piece| !matches!(piece, MissingMachineSetupPiece::CommandLineToolLink { .. })));
    }

    #[test]
    fn a_prepared_test_root_passes_the_runtimes_lock_trust_rules() {
        let root = tempfile::tempdir().unwrap();
        let paths = paths_under(root.path());

        prepare_local_proof_test_machine_root(&paths).unwrap();

        assert!(missing_machine_setup_pieces(&paths, None).is_empty());
        let lock_file = std::fs::symlink_metadata(&paths.machine_runtime_lock_file).unwrap();
        assert_eq!(lock_file.mode() & 0o7777, 0o666);
        let lock_directory =
            std::fs::symlink_metadata(&paths.machine_runtime_lock_directory).unwrap();
        assert_eq!(lock_directory.mode() & 0o7777, 0o755);
        assert!(!root.path().join("run").exists());
    }

    #[test]
    fn preparing_a_test_root_corrects_a_lock_left_at_the_wrong_mode() {
        let root = tempfile::tempdir().unwrap();
        let paths = paths_under(root.path());
        std::fs::create_dir_all(&paths.machine_runtime_lock_directory).unwrap();
        std::fs::set_permissions(
            &paths.machine_runtime_lock_directory,
            std::fs::Permissions::from_mode(0o777),
        )
        .unwrap();
        std::fs::write(&paths.machine_runtime_lock_file, b"").unwrap();
        std::fs::set_permissions(
            &paths.machine_runtime_lock_file,
            std::fs::Permissions::from_mode(0o644),
        )
        .unwrap();
        assert_eq!(missing_machine_setup_pieces(&paths, None).len(), 2);

        prepare_local_proof_test_machine_root(&paths).unwrap();

        assert!(missing_machine_setup_pieces(&paths, None).is_empty());
    }

    #[test]
    fn a_lock_file_that_is_a_symlink_is_refused() {
        let root = tempfile::tempdir().unwrap();
        let paths = paths_under(root.path());
        std::fs::create_dir_all(&paths.machine_runtime_lock_directory).unwrap();
        std::os::unix::fs::symlink(
            root.path().join("elsewhere"),
            &paths.machine_runtime_lock_file,
        )
        .unwrap();

        assert!(missing_machine_setup_pieces(&paths, None)
            .iter()
            .any(|piece| matches!(
                piece,
                MissingMachineSetupPiece::MachineRuntimeLockFile { .. }
            )));
        let refusal = prepare_local_proof_test_machine_root(&paths).unwrap_err();
        assert!(refusal.contains("runtime.lock"), "{refusal}");
    }

    #[test]
    fn a_cli_link_pointing_at_this_bundle_is_reported_linked() {
        let root = tempfile::tempdir().unwrap();
        let paths = real_shaped_paths_under(root.path());
        let bundled = root.path().join("Tatolab.app/Contents/MacOS/tatolab-cli");
        std::fs::create_dir_all(root.path().join("bin")).unwrap();
        std::os::unix::fs::symlink(&bundled, root.path().join("bin").join("tatolab")).unwrap();

        assert_eq!(
            command_line_tool_linked_at(&paths, Some(&bundled)),
            Some(root.path().join("bin").join("tatolab"))
        );
        assert!(missing_machine_setup_pieces(&paths, Some(&bundled))
            .iter()
            .all(|piece| !matches!(piece, MissingMachineSetupPiece::CommandLineToolLink { .. })));

        let another_bundle = root.path().join("Old.app/Contents/MacOS/tatolab-cli");
        assert_eq!(
            command_line_tool_linked_at(&paths, Some(&another_bundle)),
            None
        );
    }

    #[test]
    fn the_administrator_script_creates_only_what_is_missing_in_one_root_shell() {
        let missing = vec![
            MissingMachineSetupPiece::MachineRuntimeLockDirectory {
                path: PathBuf::from("/Library/Application Support/Tatolab"),
            },
            MissingMachineSetupPiece::MachineRuntimeLockFile {
                path: PathBuf::from("/Library/Application Support/Tatolab/runtime.lock"),
            },
            MissingMachineSetupPiece::CommandLineToolLink {
                link_path: PathBuf::from("/usr/local/bin/tatolab"),
                bundled_command_line_tool: PathBuf::from(
                    "/Applications/Tatolab.app/Contents/MacOS/tatolab-cli",
                ),
            },
        ];

        assert_eq!(
            machine_setup_administrator_shell_script(&missing),
            "if [ -L '/Library/Application Support/Tatolab' ]; then rm -f '/Library/Application Support/Tatolab'; fi \
             && mkdir -p '/Library/Application Support/Tatolab' \
             && chown root:wheel '/Library/Application Support/Tatolab' \
             && chmod 0755 '/Library/Application Support/Tatolab' \
             && if [ -L '/Library/Application Support/Tatolab/runtime.lock' ]; then rm -f '/Library/Application Support/Tatolab/runtime.lock'; fi \
             && touch '/Library/Application Support/Tatolab/runtime.lock' \
             && chown root:wheel '/Library/Application Support/Tatolab/runtime.lock' \
             && chmod 0666 '/Library/Application Support/Tatolab/runtime.lock' \
             && mkdir -p '/usr/local/bin' \
             && ln -sfn '/Applications/Tatolab.app/Contents/MacOS/tatolab-cli' '/usr/local/bin/tatolab'"
        );
        assert_eq!(
            machine_setup_administrator_shell_script(&missing[2..]),
            "mkdir -p '/usr/local/bin' && ln -sfn '/Applications/Tatolab.app/Contents/MacOS/tatolab-cli' '/usr/local/bin/tatolab'"
        );
    }

    #[test]
    fn paths_with_quotes_stay_one_shell_word_and_one_applescript_string() {
        let bundled =
            PathBuf::from("/Users/o'neil/Apps/\"Tatolab\" \\ copy.app/Contents/MacOS/tatolab-cli");
        let script = machine_setup_administrator_shell_script(&[
            MissingMachineSetupPiece::CommandLineToolLink {
                link_path: PathBuf::from("/usr/local/bin/tatolab"),
                bundled_command_line_tool: bundled,
            },
        ]);
        assert!(script.contains(
            r#"ln -sfn '/Users/o'\''neil/Apps/"Tatolab" \ copy.app/Contents/MacOS/tatolab-cli' '/usr/local/bin/tatolab'"#
        ));

        let applescript = administrator_prompt_applescript(&script);
        assert!(applescript.starts_with(
            r#"do shell script "mkdir -p '/usr/local/bin' && ln -sfn '/Users/o'\\''neil/Apps/\"Tatolab\" \\ copy.app"#
        ));
        assert!(applescript.ends_with(
            "with prompt \"Tatolab needs to create the machine runtime lock and link the tatolab \
             command so the runtime can start.\" with administrator privileges"
        ));
    }

    #[test]
    fn the_applescript_round_trips_through_osascript_unchanged() {
        let script = machine_setup_administrator_shell_script(&[
            MissingMachineSetupPiece::CommandLineToolLink {
                link_path: PathBuf::from("/usr/local/bin/tatolab"),
                bundled_command_line_tool: PathBuf::from("/Users/o'neil/\"T\" \\ x.app/tatolab"),
            },
        ]);
        let echo_applescript = format!("return {}", applescript_string_literal(&script));
        let output = Command::new(OSASCRIPT_PATH)
            .arg("-e")
            .arg(echo_applescript)
            .output()
            .unwrap();
        assert!(output.status.success(), "{output:?}");
        assert_eq!(String::from_utf8(output.stdout).unwrap().trim_end(), script);
    }
}
