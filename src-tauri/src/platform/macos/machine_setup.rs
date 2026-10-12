// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

//! First-launch machine setup: the machine runtime lock `tatolabd` refuses to start without, and
//! the PATH link to the bundled CLI. A real build creates whatever is missing behind one
//! administrator prompt; a local-proof build prepares its test root with no prompt.

use std::os::unix::fs::{MetadataExt, OpenOptionsExt, PermissionsExt};
use std::path::{Path, PathBuf};
use std::sync::Mutex;

use super::administrator_prompt::{
    run_behind_one_administrator_prompt, shell_word_for_path, AdministratorPromptFailure,
};
use super::tatolab_machine_paths::TatolabMachinePathsOnMacos;
use crate::platform::{
    MachineSetupAdministratorPromptOutcome, MachineSetupObservation, MachineSetupTrigger,
    TatolabMachineSetup,
};
use crate::poison_tolerant_mutex::lock_ignoring_poison;
use crate::tatolab_status::MachineSetupState;

/// The lock directory's mode: every user traverses it to open the lock file, only its owner
/// writes it. `tatolabd` refuses a directory a group or other can write.
const MACHINE_RUNTIME_LOCK_DIRECTORY_MODE: u32 = 0o755;

/// The lock file's mode, exactly: whichever user's runtime starts first takes it.
const MACHINE_RUNTIME_LOCK_FILE_MODE: u32 = 0o666;

/// The bits that let a group or other replace an entry in a directory.
const GROUP_AND_OTHER_WRITE_BITS: u32 = 0o022;

/// The words the machine setup's administrator prompt shows under "Tatolab wants to make changes."
const MACHINE_SETUP_ADMINISTRATOR_PROMPT_TEXT: &str = "Tatolab needs to create the machine \
     runtime lock and link the tatolab command so the runtime can start.";

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

/// Every piece of machine setup that is missing or wrong for `paths`, given the CLI this bundle
/// carries (none outside a bundle, which links nothing).
pub fn missing_machine_setup_pieces(
    paths: &TatolabMachinePathsOnMacos,
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

/// The PATH link when it points at the CLI this bundle carries, read from the pieces
/// [`missing_machine_setup_pieces`] found `missing`, so it costs no second readlink.
pub fn command_line_tool_linked_at(
    paths: &TatolabMachinePathsOnMacos,
    bundled_command_line_tool: Option<&Path>,
    missing: &[MissingMachineSetupPiece],
) -> Option<PathBuf> {
    bundled_command_line_tool?;
    let link_path = paths.command_line_tool_link.as_ref()?;
    let link_is_missing = missing
        .iter()
        .any(|piece| matches!(piece, MissingMachineSetupPiece::CommandLineToolLink { .. }));
    (!link_is_missing).then(|| link_path.clone())
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

/// Create every piece in `missing` behind one administrator prompt, blocking until the user
/// answers it.
pub fn run_machine_setup_behind_one_administrator_prompt(
    missing: &[MissingMachineSetupPiece],
) -> Result<(), String> {
    if missing.is_empty() {
        return Ok(());
    }
    run_behind_one_administrator_prompt(
        &machine_setup_administrator_shell_script(missing),
        MACHINE_SETUP_ADMINISTRATOR_PROMPT_TEXT,
    )
    .map_err(|failure| match failure {
        AdministratorPromptFailure::Cancelled => {
            "the administrator prompt was cancelled".to_string()
        }
        AdministratorPromptFailure::Failed {
            failure_description,
        } => format!("machine setup failed: {failure_description}"),
    })
}

/// Prepare a local-proof build's test root as the runtime's test build requires it — the lock
/// directory at 0755 and the lock file at exactly 0666, both owned by this user — with no prompt.
pub fn prepare_local_proof_test_machine_root(
    paths: &TatolabMachinePathsOnMacos,
) -> Result<(), String> {
    let expected_owner_uid = paths.machine_runtime_lock_owner.uid();
    let lock_directory = &paths.machine_runtime_lock_directory;
    std::fs::create_dir_all(lock_directory).map_err(|failure| {
        local_proof_refusal(lock_directory, &format!("could not be created ({failure})"))
    })?;
    verify_the_owner_and_set_the_mode(
        lock_directory,
        LocalProofMachineRootEntryKind::Directory,
        expected_owner_uid,
        MACHINE_RUNTIME_LOCK_DIRECTORY_MODE,
    )?;

    let lock_file = &paths.machine_runtime_lock_file;
    std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .mode(MACHINE_RUNTIME_LOCK_FILE_MODE)
        .custom_flags(libc::O_NOFOLLOW)
        .open(lock_file)
        .map_err(|failure| {
            local_proof_refusal(lock_file, &format!("could not be created ({failure})"))
        })?;
    verify_the_owner_and_set_the_mode(
        lock_file,
        LocalProofMachineRootEntryKind::RegularFile,
        expected_owner_uid,
        MACHINE_RUNTIME_LOCK_FILE_MODE,
    )
}

/// What a local-proof machine root entry must be, not a symlink to one.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum LocalProofMachineRootEntryKind {
    Directory,
    RegularFile,
}

impl LocalProofMachineRootEntryKind {
    fn describes(self, file_type: std::fs::FileType) -> bool {
        match self {
            LocalProofMachineRootEntryKind::Directory => file_type.is_dir(),
            LocalProofMachineRootEntryKind::RegularFile => file_type.is_file(),
        }
    }

    fn what_any_other_entry_is(self) -> &'static str {
        match self {
            LocalProofMachineRootEntryKind::Directory => "is not a real directory",
            LocalProofMachineRootEntryKind::RegularFile => "is not a regular file",
        }
    }
}

/// Refuse `path` unless it is a `kind` owned by `expected_owner_uid`, then set its mode to exactly
/// `mode`, which the process umask stripped from any mode it was created with.
fn verify_the_owner_and_set_the_mode(
    path: &Path,
    kind: LocalProofMachineRootEntryKind,
    expected_owner_uid: u32,
    mode: u32,
) -> Result<(), String> {
    let metadata = std::fs::symlink_metadata(path).map_err(|failure| {
        local_proof_refusal(path, &format!("could not be inspected ({failure})"))
    })?;
    if !kind.describes(metadata.file_type()) {
        return Err(local_proof_refusal(path, kind.what_any_other_entry_is()));
    }
    if metadata.uid() != expected_owner_uid {
        return Err(local_proof_refusal(
            path,
            &format!("is owned by uid {}", metadata.uid()),
        ));
    }
    std::fs::set_permissions(path, std::fs::Permissions::from_mode(mode)).map_err(|failure| {
        local_proof_refusal(path, &format!("could not be set to {mode:04o} ({failure})"))
    })
}

fn local_proof_refusal(path: &Path, what_is_wrong: &str) -> String {
    format!(
        "the local-proof machine root cannot be prepared: {} {what_is_wrong}",
        path.display()
    )
}

/// What this launch has done with the administrator prompt: reconciling the switch never shows
/// it, opening the app shows it at most once, and "Set Up Tatolab…" shows it again on request,
/// never while one is showing.
#[derive(Debug, Default)]
struct AdministratorPromptThisLaunch {
    shown_this_launch: bool,
    showing: bool,
}

impl AdministratorPromptThisLaunch {
    /// Whether `trigger` may show the prompt now; if so, it counts as showing.
    fn begin_prompt(&mut self, trigger: MachineSetupTrigger) -> bool {
        let prompt_may_show_now = match trigger {
            MachineSetupTrigger::ReconcilingTheSwitch => false,
            MachineSetupTrigger::AppOpened => !self.shown_this_launch && !self.showing,
            MachineSetupTrigger::UserAsked => !self.showing,
        };
        if prompt_may_show_now {
            self.shown_this_launch = true;
            self.showing = true;
        }
        prompt_may_show_now
    }

    /// The prompt was answered, cancelled, or failed to show.
    fn finish_prompt(&mut self) {
        self.showing = false;
    }

    /// Whether the prompt is showing now.
    fn showing(&self) -> bool {
        self.showing
    }
}

/// macOS's machine setup: a real build creates whatever is missing behind one administrator
/// prompt, shown at most once per launch when the app opens and again on request; a local-proof
/// build prepares its test root by itself before every reconciliation of the switch.
pub struct MachineSetupBehindAnAdministratorPrompt {
    machine_paths: TatolabMachinePathsOnMacos,
    bundled_command_line_tool: Option<PathBuf>,
    administrator_prompt_this_launch: Mutex<AdministratorPromptThisLaunch>,
}

impl MachineSetupBehindAnAdministratorPrompt {
    /// The setup of `machine_paths` for the CLI this bundle carries, `None` outside a bundle.
    pub fn new(
        machine_paths: TatolabMachinePathsOnMacos,
        bundled_command_line_tool: Option<PathBuf>,
    ) -> Self {
        Self {
            machine_paths,
            bundled_command_line_tool,
            administrator_prompt_this_launch: Mutex::new(AdministratorPromptThisLaunch::default()),
        }
    }

    fn missing_machine_setup_pieces(&self) -> Vec<MissingMachineSetupPiece> {
        missing_machine_setup_pieces(
            &self.machine_paths,
            self.bundled_command_line_tool.as_deref(),
        )
    }

    fn prepare_the_local_proof_test_root(&self) {
        if let Err(failure) = prepare_local_proof_test_machine_root(&self.machine_paths) {
            tracing::error!(%failure, "the local-proof machine root could not be prepared");
        }
    }

    /// Show the administrator prompt for whatever setup is missing, if `trigger` may show it now,
    /// blocking until it is answered.
    fn run_machine_setup_behind_the_administrator_prompt(
        &self,
        trigger: MachineSetupTrigger,
    ) -> MachineSetupAdministratorPromptOutcome {
        let missing = self.missing_machine_setup_pieces();
        if missing.is_empty()
            || !lock_ignoring_poison(&self.administrator_prompt_this_launch).begin_prompt(trigger)
        {
            return MachineSetupAdministratorPromptOutcome::NoAdministratorPromptShown;
        }
        tracing::info!(
            ?missing,
            ?trigger,
            "showing the administrator prompt for machine setup"
        );
        let machine_setup = run_machine_setup_behind_one_administrator_prompt(&missing);
        lock_ignoring_poison(&self.administrator_prompt_this_launch).finish_prompt();
        match machine_setup {
            Ok(()) => tracing::info!("machine setup is complete"),
            Err(failure) => tracing::warn!(%failure, "machine setup is unfinished"),
        }
        MachineSetupAdministratorPromptOutcome::AdministratorPromptShown
    }
}

impl TatolabMachineSetup for MachineSetupBehindAnAdministratorPrompt {
    fn observe_machine_setup(&self) -> MachineSetupObservation {
        let administrator_prompt_showing =
            lock_ignoring_poison(&self.administrator_prompt_this_launch).showing();
        let missing = self.missing_machine_setup_pieces();
        MachineSetupObservation {
            machine_setup_state: MachineSetupState::from_observation(
                !missing.is_empty(),
                administrator_prompt_showing,
            ),
            command_line_tool_linked_at: command_line_tool_linked_at(
                &self.machine_paths,
                self.bundled_command_line_tool.as_deref(),
                &missing,
            ),
        }
    }

    fn set_up_the_machine(
        &self,
        trigger: MachineSetupTrigger,
    ) -> MachineSetupAdministratorPromptOutcome {
        if self.machine_paths.local_proof_test_machine_root.is_some() {
            if trigger == MachineSetupTrigger::ReconcilingTheSwitch {
                self.prepare_the_local_proof_test_root();
            }
            return MachineSetupAdministratorPromptOutcome::NoAdministratorPromptShown;
        }
        self.run_machine_setup_behind_the_administrator_prompt(trigger)
    }

    fn set_up_tatolab_refusal(&self) -> Option<&'static str> {
        None
    }
}

#[cfg(test)]
mod tests {
    use std::process::Command;

    use super::*;
    use crate::platform::current_process_uid;
    use crate::platform::macos::administrator_prompt::{
        administrator_prompt_applescript, applescript_string_literal, OSASCRIPT_PATH,
    };
    use crate::platform::macos::tatolab_machine_paths::MachineRuntimeLockOwner;

    fn paths_under(root: &Path) -> TatolabMachinePathsOnMacos {
        TatolabMachinePathsOnMacos::under_a_local_proof_test_root(root, current_process_uid())
    }

    fn real_shaped_paths_under(root: &Path) -> TatolabMachinePathsOnMacos {
        TatolabMachinePathsOnMacos {
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
            missing,
            vec![
                MissingMachineSetupPiece::MachineRuntimeLockDirectory {
                    path: paths.machine_runtime_lock_directory.clone(),
                },
                MissingMachineSetupPiece::MachineRuntimeLockFile {
                    path: paths.machine_runtime_lock_file.clone(),
                },
                MissingMachineSetupPiece::CommandLineToolLink {
                    link_path: root.path().join("bin").join("tatolab"),
                    bundled_command_line_tool: bundled.clone(),
                },
            ]
        );
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
    fn a_cli_link_counts_as_set_up_only_while_it_points_at_this_bundle() {
        let root = tempfile::tempdir().unwrap();
        let paths = real_shaped_paths_under(root.path());
        let bundled = root.path().join("Tatolab.app/Contents/MacOS/tatolab-cli");
        std::fs::create_dir_all(root.path().join("bin")).unwrap();
        std::os::unix::fs::symlink(&bundled, root.path().join("bin").join("tatolab")).unwrap();
        let misses_the_cli_link = |bundled_command_line_tool: &Path| {
            missing_machine_setup_pieces(&paths, Some(bundled_command_line_tool))
                .iter()
                .any(|piece| matches!(piece, MissingMachineSetupPiece::CommandLineToolLink { .. }))
        };

        assert!(!misses_the_cli_link(&bundled));
        assert!(misses_the_cli_link(
            &root.path().join("Old.app/Contents/MacOS/tatolab-cli")
        ));
    }

    #[test]
    fn the_cli_reads_linked_only_while_its_link_points_at_this_bundle() {
        let root = tempfile::tempdir().unwrap();
        let paths = real_shaped_paths_under(root.path());
        let link_path = root.path().join("bin").join("tatolab");
        let bundled = root.path().join("Tatolab.app/Contents/MacOS/tatolab-cli");
        let linked_at = |bundled_command_line_tool: &Path| {
            let missing = missing_machine_setup_pieces(&paths, Some(bundled_command_line_tool));
            command_line_tool_linked_at(&paths, Some(bundled_command_line_tool), &missing)
        };

        assert_eq!(linked_at(&bundled), None);

        std::fs::create_dir_all(root.path().join("bin")).unwrap();
        std::os::unix::fs::symlink(&bundled, &link_path).unwrap();
        assert_eq!(linked_at(&bundled), Some(link_path));
        assert_eq!(
            linked_at(&root.path().join("Old.app/Contents/MacOS/tatolab-cli")),
            None
        );
    }

    #[test]
    fn outside_a_bundle_or_in_a_local_proof_build_the_cli_reads_unlinked() {
        let root = tempfile::tempdir().unwrap();
        let bundled = root.path().join("Tatolab.app/Contents/MacOS/tatolab-cli");

        let real_shaped_paths = real_shaped_paths_under(root.path());
        assert_eq!(
            command_line_tool_linked_at(&real_shaped_paths, None, &[]),
            None
        );
        let local_proof_paths = paths_under(root.path());
        assert_eq!(
            command_line_tool_linked_at(&local_proof_paths, Some(&bundled), &[]),
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

        let applescript =
            administrator_prompt_applescript(&script, MACHINE_SETUP_ADMINISTRATOR_PROMPT_TEXT);
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

    #[test]
    fn opening_the_app_shows_the_administrator_prompt_once_per_launch_even_when_cancelled() {
        let mut administrator_prompt = AdministratorPromptThisLaunch::default();

        assert!(administrator_prompt.begin_prompt(MachineSetupTrigger::AppOpened));
        assert!(administrator_prompt.showing());
        administrator_prompt.finish_prompt();
        assert!(!administrator_prompt.showing());

        assert!(!administrator_prompt.begin_prompt(MachineSetupTrigger::AppOpened));
        assert!(!administrator_prompt.showing());
    }

    #[test]
    fn set_up_tatolab_shows_the_prompt_again_after_a_cancelled_one() {
        let mut administrator_prompt = AdministratorPromptThisLaunch::default();
        assert!(administrator_prompt.begin_prompt(MachineSetupTrigger::AppOpened));
        administrator_prompt.finish_prompt();

        assert!(administrator_prompt.begin_prompt(MachineSetupTrigger::UserAsked));
        administrator_prompt.finish_prompt();
        assert!(administrator_prompt.begin_prompt(MachineSetupTrigger::UserAsked));
    }

    #[test]
    fn no_second_prompt_shows_while_one_is_showing() {
        let mut administrator_prompt = AdministratorPromptThisLaunch::default();
        assert!(administrator_prompt.begin_prompt(MachineSetupTrigger::UserAsked));

        assert!(!administrator_prompt.begin_prompt(MachineSetupTrigger::UserAsked));
        assert!(!administrator_prompt.begin_prompt(MachineSetupTrigger::AppOpened));
    }

    #[test]
    fn a_prompt_the_user_asked_for_counts_as_the_launch_prompt() {
        let mut administrator_prompt = AdministratorPromptThisLaunch::default();
        assert!(administrator_prompt.begin_prompt(MachineSetupTrigger::UserAsked));
        administrator_prompt.finish_prompt();

        assert!(!administrator_prompt.begin_prompt(MachineSetupTrigger::AppOpened));
    }

    #[test]
    fn reconciling_the_switch_never_shows_the_prompt_nor_counts_as_the_launch_prompt() {
        let mut administrator_prompt = AdministratorPromptThisLaunch::default();

        assert!(!administrator_prompt.begin_prompt(MachineSetupTrigger::ReconcilingTheSwitch));
        assert!(!administrator_prompt.showing());
        assert!(administrator_prompt.begin_prompt(MachineSetupTrigger::AppOpened));
    }

    #[test]
    fn a_real_build_missing_its_setup_shows_no_prompt_while_reconciling_the_switch() {
        let root = tempfile::tempdir().unwrap();
        let machine_setup = MachineSetupBehindAnAdministratorPrompt::new(
            TatolabMachinePathsOnMacos {
                local_proof_test_machine_root: None,
                ..real_shaped_paths_under(root.path())
            },
            None,
        );

        assert_eq!(
            machine_setup.set_up_the_machine(MachineSetupTrigger::ReconcilingTheSwitch),
            MachineSetupAdministratorPromptOutcome::NoAdministratorPromptShown
        );
        assert_eq!(
            machine_setup.observe_machine_setup().machine_setup_state,
            MachineSetupState::NeedsAdministrator
        );
    }

    #[test]
    fn a_local_proof_build_prepares_its_test_root_only_when_reconciling_and_never_prompts() {
        let root = tempfile::tempdir().unwrap();
        let machine_setup =
            MachineSetupBehindAnAdministratorPrompt::new(paths_under(root.path()), None);

        for trigger in [
            MachineSetupTrigger::AppOpened,
            MachineSetupTrigger::UserAsked,
        ] {
            assert_eq!(
                machine_setup.set_up_the_machine(trigger),
                MachineSetupAdministratorPromptOutcome::NoAdministratorPromptShown,
                "{trigger:?}"
            );
        }
        assert_eq!(
            machine_setup.observe_machine_setup().machine_setup_state,
            MachineSetupState::NeedsAdministrator
        );

        assert_eq!(
            machine_setup.set_up_the_machine(MachineSetupTrigger::ReconcilingTheSwitch),
            MachineSetupAdministratorPromptOutcome::NoAdministratorPromptShown
        );
        assert_eq!(
            machine_setup.observe_machine_setup(),
            MachineSetupObservation {
                machine_setup_state: MachineSetupState::Complete,
                command_line_tool_linked_at: None,
            }
        );
    }

    #[test]
    fn a_set_up_machine_shows_no_prompt_and_reads_the_cli_linked() {
        let root = tempfile::tempdir().unwrap();
        prepare_local_proof_test_machine_root(&paths_under(root.path())).unwrap();
        let paths = TatolabMachinePathsOnMacos {
            local_proof_test_machine_root: None,
            ..real_shaped_paths_under(root.path())
        };
        let link_path = root.path().join("bin").join("tatolab");
        let bundled = root.path().join("Tatolab.app/Contents/MacOS/tatolab-cli");
        std::fs::create_dir_all(root.path().join("bin")).unwrap();
        std::os::unix::fs::symlink(&bundled, &link_path).unwrap();
        let machine_setup = MachineSetupBehindAnAdministratorPrompt::new(paths, Some(bundled));
        let set_up_machine = MachineSetupObservation {
            machine_setup_state: MachineSetupState::Complete,
            command_line_tool_linked_at: Some(link_path),
        };
        assert_eq!(machine_setup.observe_machine_setup(), set_up_machine);

        for trigger in [
            MachineSetupTrigger::ReconcilingTheSwitch,
            MachineSetupTrigger::AppOpened,
            MachineSetupTrigger::UserAsked,
        ] {
            assert_eq!(
                machine_setup.set_up_the_machine(trigger),
                MachineSetupAdministratorPromptOutcome::NoAdministratorPromptShown,
                "{trigger:?}"
            );
        }
        assert_eq!(machine_setup.observe_machine_setup(), set_up_machine);
        assert_eq!(machine_setup.set_up_tatolab_refusal(), None);
    }
}
