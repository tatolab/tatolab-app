// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

//! "Uninstall Tatolab…" on macOS, as the installer's `--uninstall` does on Linux: the service and
//! the files go, and the runtime's state directory, `~/Library/Application Support/Tatolab`, stays.
//! One administrator prompt removes the machine-wide files first, so a cancelled prompt changes
//! nothing; then "Run Tatolab" is turned off, which unregisters the runtime's agent and stops the
//! runtime, the app's own config directory is removed, the bundle goes to the Trash, and the app
//! quits. A local-proof build removes its test root instead of prompting.

use std::ffi::OsStr;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};

use objc2_foundation::{NSFileManager, NSString, NSURL};
use tauri::{AppHandle, Manager};

use super::administrator_prompt::{
    run_behind_one_administrator_prompt, shell_word_for_path, AdministratorPromptFailure,
};
use super::tatolab_machine_paths::{app_bundle_of_this_executable, TatolabMachinePathsOnMacos};
use crate::platform::current_process_uid;
use crate::run_tatolab_switch::RunTatolabReconciliation;
use crate::tatolab_app_controller::TatolabAppController;

/// The words the uninstall's administrator prompt shows under "Tatolab wants to make changes."
const UNINSTALL_ADMINISTRATOR_PROMPT_TEXT: &str =
    "Tatolab needs to remove the machine runtime lock and the tatolab command to uninstall.";

/// Whether an uninstall is under way in this launch, so a second request shows no second prompt.
static TATOLAB_UNINSTALL_IN_PROGRESS: AtomicBool = AtomicBool::new(false);

/// What uninstalling removes machine-wide before anything else.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum MachineFilesToRemove {
    /// A real build's CLI link and machine runtime lock directory, by this root script behind one
    /// administrator prompt.
    BehindTheAdministratorPrompt { removal_script: String },
    /// A local-proof build's test root, removed with no prompt.
    LocalProofTestRoot { test_machine_root: PathBuf },
}

/// The steps uninstalling takes, in the order [`uninstall_tatolab_in_order`] takes them; a fake
/// records them in tests.
pub trait TatolabUninstallSteps {
    /// Run `removal_script` as root behind one administrator prompt.
    fn run_behind_the_administrator_prompt(
        &self,
        removal_script: &str,
    ) -> Result<(), AdministratorPromptFailure>;

    /// Remove a local-proof build's test root and everything under it, with no prompt.
    fn remove_the_local_proof_test_root(&self, test_machine_root: &Path) -> Result<(), String>;

    /// Turn "Run Tatolab" off, which unregisters the runtime's agent and so stops the runtime.
    fn turn_run_tatolab_off(&self) -> Result<(), String>;

    /// Remove the app's own config directory, where the switch is remembered.
    fn remove_the_app_config_directory(&self) -> Result<(), String>;

    /// Move this app's bundle to the Trash.
    fn move_this_app_bundle_to_the_trash(&self) -> Result<(), String>;

    /// Quit the app.
    fn quit_the_app(&self);
}

/// Uninstall Tatolab in order — `machine_files` first, so a cancelled prompt changes nothing,
/// then the runtime's agent, the app's config directory and its bundle — and quit. The first step
/// that fails stops the rest and is the answer.
pub fn uninstall_tatolab_in_order(
    steps: &dyn TatolabUninstallSteps,
    machine_files: &MachineFilesToRemove,
) -> Result<(), String> {
    match machine_files {
        MachineFilesToRemove::BehindTheAdministratorPrompt { removal_script } => steps
            .run_behind_the_administrator_prompt(removal_script)
            .map_err(|failure| match failure {
                AdministratorPromptFailure::Cancelled => {
                    "the administrator prompt was cancelled, so nothing was uninstalled".to_string()
                }
                AdministratorPromptFailure::Failed {
                    failure_description,
                } => format!(
                    "the machine's Tatolab files could not be removed: {failure_description}"
                ),
            })?,
        MachineFilesToRemove::LocalProofTestRoot { test_machine_root } => {
            steps.remove_the_local_proof_test_root(test_machine_root)?
        }
    }
    steps.turn_run_tatolab_off()?;
    steps.remove_the_app_config_directory()?;
    steps.move_this_app_bundle_to_the_trash()?;
    steps.quit_the_app();
    Ok(())
}

/// What uninstalling removes machine-wide for `machine_paths`, the bundle at `app_bundle` being
/// the one whose CLI link goes.
pub fn machine_files_to_remove(
    machine_paths: &TatolabMachinePathsOnMacos,
    app_bundle: &Path,
) -> MachineFilesToRemove {
    match &machine_paths.local_proof_test_machine_root {
        Some(test_machine_root) => MachineFilesToRemove::LocalProofTestRoot {
            test_machine_root: test_machine_root.clone(),
        },
        None => MachineFilesToRemove::BehindTheAdministratorPrompt {
            removal_script: tatolab_uninstall_administrator_shell_script(
                machine_paths.command_line_tool_link.as_deref(),
                app_bundle,
                &machine_paths.machine_runtime_lock_directory,
            ),
        },
    }
}

/// The one root shell script uninstalling runs: it removes `command_line_tool_link` only while it
/// points into `app_bundle`, then `machine_runtime_lock_directory` and everything in it.
pub fn tatolab_uninstall_administrator_shell_script(
    command_line_tool_link: Option<&Path>,
    app_bundle: &Path,
    machine_runtime_lock_directory: &Path,
) -> String {
    let mut steps = Vec::new();
    if let Some(command_line_tool_link) = command_line_tool_link {
        let link = shell_word_for_path(command_line_tool_link);
        steps.push(format!(
            "case \"$(readlink {link})\" in {}/*) rm -f {link} ;; esac",
            shell_word_for_path(app_bundle)
        ));
    }
    steps.push(format!(
        "rm -rf {}",
        shell_word_for_path(machine_runtime_lock_directory)
    ));
    steps.join(" && ")
}

/// Uninstall Tatolab from this Mac, ending with the app quitting; refused with the reason when
/// the administrator prompt is cancelled, a step fails, or an uninstall is already under way.
pub fn uninstall_tatolab(app: &AppHandle, controller: &TatolabAppController) -> Result<(), String> {
    if TATOLAB_UNINSTALL_IN_PROGRESS.swap(true, Ordering::AcqRel) {
        return Err("Tatolab is already being uninstalled".to_string());
    }
    let uninstalled = uninstall_tatolab_from_this_mac(app, controller);
    if let Err(failure) = &uninstalled {
        tracing::warn!(%failure, "Tatolab was not uninstalled");
        TATOLAB_UNINSTALL_IN_PROGRESS.store(false, Ordering::Release);
    }
    uninstalled
}

fn uninstall_tatolab_from_this_mac(
    app: &AppHandle,
    controller: &TatolabAppController,
) -> Result<(), String> {
    let app_bundle = app_bundle_of_this_executable().ok_or_else(|| {
        "this Tatolab is not running from Tatolab.app, so there is no app to uninstall".to_string()
    })?;
    let app_config_directory = app
        .path()
        .app_config_dir()
        .map_err(|failure| format!("the app's config directory is unknown: {failure}"))?;
    let machine_paths = TatolabMachinePathsOnMacos::for_this_build(current_process_uid());
    let machine_files = machine_files_to_remove(&machine_paths, &app_bundle);
    tracing::info!(
        app_bundle = %app_bundle.display(),
        ?machine_files,
        "uninstalling Tatolab"
    );
    let steps = TatolabUninstallStepsOnThisMac {
        app,
        controller,
        app_bundle,
        app_config_directory,
        app_identifier: app.config().identifier.clone(),
    };
    uninstall_tatolab_in_order(&steps, &machine_files)
}

/// The uninstall steps for this app, its bundle and its config directory.
struct TatolabUninstallStepsOnThisMac<'a> {
    app: &'a AppHandle,
    controller: &'a TatolabAppController,
    app_bundle: PathBuf,
    app_config_directory: PathBuf,
    app_identifier: String,
}

impl TatolabUninstallSteps for TatolabUninstallStepsOnThisMac<'_> {
    fn run_behind_the_administrator_prompt(
        &self,
        removal_script: &str,
    ) -> Result<(), AdministratorPromptFailure> {
        run_behind_one_administrator_prompt(removal_script, UNINSTALL_ADMINISTRATOR_PROMPT_TEXT)
    }

    fn remove_the_local_proof_test_root(&self, test_machine_root: &Path) -> Result<(), String> {
        remove_the_directory_unless_absent(test_machine_root)
    }

    fn turn_run_tatolab_off(&self) -> Result<(), String> {
        run_tatolab_turned_off(self.controller.set_run_tatolab(false))
    }

    fn remove_the_app_config_directory(&self) -> Result<(), String> {
        remove_the_app_config_directory_named_for(&self.app_config_directory, &self.app_identifier)
    }

    fn move_this_app_bundle_to_the_trash(&self) -> Result<(), String> {
        let app_bundle_url =
            NSURL::fileURLWithPath(&NSString::from_str(&self.app_bundle.to_string_lossy()));
        NSFileManager::defaultManager()
            .trashItemAtURL_resultingItemURL_error(&app_bundle_url, None)
            .map_err(|error| {
                format!(
                    "{} could not be moved to the Trash: {}",
                    self.app_bundle.display(),
                    error.localizedDescription()
                )
            })
    }

    fn quit_the_app(&self) {
        tracing::info!("Tatolab is uninstalled; quitting the app");
        self.app.exit(0);
    }
}

/// Whether turning "Run Tatolab" off left the runtime's launch agent unregistered: only
/// `Unregistered` lets the uninstall go on, and any other reconciliation stops it, named.
fn run_tatolab_turned_off(reconciliation: RunTatolabReconciliation) -> Result<(), String> {
    match reconciliation {
        RunTatolabReconciliation::Unregistered => Ok(()),
        RunTatolabReconciliation::UnregistrationFailed {
            failure_description,
        } => Err(format!(
            "the runtime's launch agent could not be unregistered: {failure_description}"
        )),
        unexpected_reconciliation => Err(format!(
            "turning Run Tatolab off answered {unexpected_reconciliation:?} rather than \
             unregistering the runtime's launch agent, so nothing more was uninstalled"
        )),
    }
}

/// Remove `app_config_directory`, refusing one not named for `app_identifier`, as Tauri names the
/// app's own.
fn remove_the_app_config_directory_named_for(
    app_config_directory: &Path,
    app_identifier: &str,
) -> Result<(), String> {
    if app_config_directory.file_name() != Some(OsStr::new(app_identifier)) {
        return Err(format!(
            "{} is not named for the app's identifier {app_identifier}, so it was not removed",
            app_config_directory.display()
        ));
    }
    remove_the_directory_unless_absent(app_config_directory)
}

/// Remove `directory` and everything in it; one that is not there is already removed.
fn remove_the_directory_unless_absent(directory: &Path) -> Result<(), String> {
    match std::fs::remove_dir_all(directory) {
        Ok(()) => Ok(()),
        Err(failure) if failure.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(failure) => Err(format!(
            "{} could not be removed: {failure}",
            directory.display()
        )),
    }
}

#[cfg(test)]
mod tests {
    use std::cell::RefCell;
    use std::process::Command;

    use super::*;

    #[derive(Debug, Clone, PartialEq, Eq)]
    enum FakeUninstallStep {
        AdministratorPrompt { removal_script: String },
        RemoveTheLocalProofTestRoot { test_machine_root: PathBuf },
        TurnRunTatolabOff,
        RemoveTheAppConfigDirectory,
        MoveThisAppBundleToTheTrash,
        QuitTheApp,
    }

    /// Records every step it is asked to take; the prompt answers as the test says, and one step
    /// may fail.
    struct FakeUninstallSteps {
        administrator_prompt_answer: Result<(), AdministratorPromptFailure>,
        failing_step: Option<FakeUninstallStep>,
        steps_taken: RefCell<Vec<FakeUninstallStep>>,
    }

    impl FakeUninstallSteps {
        fn answering_the_prompt(
            administrator_prompt_answer: Result<(), AdministratorPromptFailure>,
        ) -> Self {
            Self {
                administrator_prompt_answer,
                failing_step: None,
                steps_taken: RefCell::new(Vec::new()),
            }
        }

        fn take(&self, step: FakeUninstallStep) -> Result<(), String> {
            self.steps_taken.borrow_mut().push(step.clone());
            match &self.failing_step {
                Some(failing_step) if *failing_step == step => Err(format!("{step:?} failed")),
                _ => Ok(()),
            }
        }

        fn steps_taken(&self) -> Vec<FakeUninstallStep> {
            self.steps_taken.borrow().clone()
        }
    }

    impl TatolabUninstallSteps for FakeUninstallSteps {
        fn run_behind_the_administrator_prompt(
            &self,
            removal_script: &str,
        ) -> Result<(), AdministratorPromptFailure> {
            self.steps_taken
                .borrow_mut()
                .push(FakeUninstallStep::AdministratorPrompt {
                    removal_script: removal_script.to_string(),
                });
            self.administrator_prompt_answer.clone()
        }

        fn remove_the_local_proof_test_root(&self, test_machine_root: &Path) -> Result<(), String> {
            self.take(FakeUninstallStep::RemoveTheLocalProofTestRoot {
                test_machine_root: test_machine_root.to_path_buf(),
            })
        }

        fn turn_run_tatolab_off(&self) -> Result<(), String> {
            self.take(FakeUninstallStep::TurnRunTatolabOff)
        }

        fn remove_the_app_config_directory(&self) -> Result<(), String> {
            self.take(FakeUninstallStep::RemoveTheAppConfigDirectory)
        }

        fn move_this_app_bundle_to_the_trash(&self) -> Result<(), String> {
            self.take(FakeUninstallStep::MoveThisAppBundleToTheTrash)
        }

        fn quit_the_app(&self) {
            self.steps_taken
                .borrow_mut()
                .push(FakeUninstallStep::QuitTheApp);
        }
    }

    fn removal_behind_the_prompt() -> MachineFilesToRemove {
        MachineFilesToRemove::BehindTheAdministratorPrompt {
            removal_script: "rm -rf '/Library/Application Support/Tatolab'".to_string(),
        }
    }

    #[test]
    fn a_real_build_prompts_once_then_stops_the_runtime_removes_the_app_and_quits() {
        let steps = FakeUninstallSteps::answering_the_prompt(Ok(()));

        assert_eq!(
            uninstall_tatolab_in_order(&steps, &removal_behind_the_prompt()),
            Ok(())
        );
        assert_eq!(
            steps.steps_taken(),
            vec![
                FakeUninstallStep::AdministratorPrompt {
                    removal_script: "rm -rf '/Library/Application Support/Tatolab'".to_string(),
                },
                FakeUninstallStep::TurnRunTatolabOff,
                FakeUninstallStep::RemoveTheAppConfigDirectory,
                FakeUninstallStep::MoveThisAppBundleToTheTrash,
                FakeUninstallStep::QuitTheApp,
            ]
        );
    }

    #[test]
    fn a_cancelled_prompt_changes_nothing() {
        let steps =
            FakeUninstallSteps::answering_the_prompt(Err(AdministratorPromptFailure::Cancelled));

        assert_eq!(
            uninstall_tatolab_in_order(&steps, &removal_behind_the_prompt()),
            Err("the administrator prompt was cancelled, so nothing was uninstalled".to_string())
        );
        assert_eq!(steps.steps_taken().len(), 1, "{:?}", steps.steps_taken());
    }

    #[test]
    fn a_failed_prompt_changes_nothing_else_and_says_why() {
        let steps =
            FakeUninstallSteps::answering_the_prompt(Err(AdministratorPromptFailure::Failed {
                failure_description: "rm: Operation not permitted (exit status: 1)".to_string(),
            }));

        assert_eq!(
            uninstall_tatolab_in_order(&steps, &removal_behind_the_prompt()),
            Err(
                "the machine's Tatolab files could not be removed: rm: Operation not \
                 permitted (exit status: 1)"
                    .to_string()
            )
        );
        assert_eq!(steps.steps_taken().len(), 1, "{:?}", steps.steps_taken());
    }

    #[test]
    fn a_local_proof_build_removes_its_test_root_with_no_prompt() {
        let steps =
            FakeUninstallSteps::answering_the_prompt(Err(AdministratorPromptFailure::Cancelled));

        assert_eq!(
            uninstall_tatolab_in_order(
                &steps,
                &MachineFilesToRemove::LocalProofTestRoot {
                    test_machine_root: PathBuf::from("/tmp/tatolab-proof"),
                }
            ),
            Ok(())
        );
        assert_eq!(
            steps.steps_taken(),
            vec![
                FakeUninstallStep::RemoveTheLocalProofTestRoot {
                    test_machine_root: PathBuf::from("/tmp/tatolab-proof"),
                },
                FakeUninstallStep::TurnRunTatolabOff,
                FakeUninstallStep::RemoveTheAppConfigDirectory,
                FakeUninstallStep::MoveThisAppBundleToTheTrash,
                FakeUninstallStep::QuitTheApp,
            ]
        );
    }

    #[test]
    fn the_first_failing_step_stops_the_rest_and_the_app_stays_open() {
        let mut steps = FakeUninstallSteps::answering_the_prompt(Ok(()));
        steps.failing_step = Some(FakeUninstallStep::MoveThisAppBundleToTheTrash);

        assert_eq!(
            uninstall_tatolab_in_order(&steps, &removal_behind_the_prompt()),
            Err("MoveThisAppBundleToTheTrash failed".to_string())
        );
        assert_eq!(
            steps.steps_taken().last(),
            Some(&FakeUninstallStep::MoveThisAppBundleToTheTrash)
        );
    }

    #[test]
    fn a_real_build_removes_its_link_and_lock_behind_the_prompt_and_a_local_proof_its_test_root() {
        let app_bundle = Path::new("/Applications/Tatolab.app");

        assert_eq!(
            machine_files_to_remove(
                &TatolabMachinePathsOnMacos::for_the_real_machine(501),
                app_bundle
            ),
            MachineFilesToRemove::BehindTheAdministratorPrompt {
                removal_script: "case \"$(readlink '/usr/local/bin/tatolab')\" in \
                     '/Applications/Tatolab.app'/*) rm -f '/usr/local/bin/tatolab' ;; esac \
                     && rm -rf '/Library/Application Support/Tatolab'"
                    .to_string(),
            }
        );
        assert_eq!(
            machine_files_to_remove(
                &TatolabMachinePathsOnMacos::under_a_local_proof_test_root(
                    Path::new("/tmp/tatolab-proof"),
                    501
                ),
                app_bundle
            ),
            MachineFilesToRemove::LocalProofTestRoot {
                test_machine_root: PathBuf::from("/tmp/tatolab-proof"),
            }
        );
    }

    #[test]
    fn a_bundle_path_with_quotes_and_glob_characters_stays_one_literal_shell_word() {
        let script = tatolab_uninstall_administrator_shell_script(
            Some(Path::new("/usr/local/bin/tatolab")),
            Path::new("/Users/o'neil/My Apps/T*tolab \"x\" \\ $HOME.app"),
            Path::new("/Library/Application Support/Tatolab"),
        );

        assert_eq!(
            script,
            r#"case "$(readlink '/usr/local/bin/tatolab')" in '/Users/o'\''neil/My Apps/T*tolab "x" \ $HOME.app'/*) rm -f '/usr/local/bin/tatolab' ;; esac && rm -rf '/Library/Application Support/Tatolab'"#
        );
    }

    struct MachineFilesUnderTest {
        root: tempfile::TempDir,
        command_line_tool_link: PathBuf,
        machine_runtime_lock_directory: PathBuf,
    }

    impl MachineFilesUnderTest {
        fn with_the_cli_linked_to(link_target_inside_root: Option<&str>) -> Self {
            let root = tempfile::tempdir().unwrap();
            let machine_runtime_lock_directory =
                root.path().join("Library/Application Support/Tatolab");
            std::fs::create_dir_all(&machine_runtime_lock_directory).unwrap();
            std::fs::write(machine_runtime_lock_directory.join("runtime.lock"), b"").unwrap();
            let command_line_tool_link = root.path().join("bin/tatolab");
            std::fs::create_dir_all(command_line_tool_link.parent().unwrap()).unwrap();
            if let Some(link_target_inside_root) = link_target_inside_root {
                std::os::unix::fs::symlink(
                    root.path().join(link_target_inside_root),
                    &command_line_tool_link,
                )
                .unwrap();
            }
            Self {
                root,
                command_line_tool_link,
                machine_runtime_lock_directory,
            }
        }

        /// Run the uninstall's removal script as this user, for the bundle at `app_bundle_inside_root`.
        fn run_the_removal_script_for(&self, app_bundle_inside_root: &str) {
            let script = tatolab_uninstall_administrator_shell_script(
                Some(&self.command_line_tool_link),
                &self.root.path().join(app_bundle_inside_root),
                &self.machine_runtime_lock_directory,
            );
            let output = Command::new("/bin/sh")
                .arg("-c")
                .arg(&script)
                .output()
                .unwrap();
            assert!(output.status.success(), "{script}: {output:?}");
            assert!(!self.machine_runtime_lock_directory.exists());
        }

        fn command_line_tool_link_remains(&self) -> bool {
            std::fs::symlink_metadata(&self.command_line_tool_link).is_ok()
        }
    }

    #[test]
    fn the_removal_script_removes_the_cli_link_only_while_it_points_into_this_bundle() {
        let into_this_bundle = MachineFilesUnderTest::with_the_cli_linked_to(Some(
            "Apps/Tatolab.app/Contents/MacOS/tatolab-cli",
        ));
        into_this_bundle.run_the_removal_script_for("Apps/Tatolab.app");
        assert!(!into_this_bundle.command_line_tool_link_remains());

        let into_another_bundle = MachineFilesUnderTest::with_the_cli_linked_to(Some(
            "Apps/Tatolab.app.old/Contents/MacOS/tatolab-cli",
        ));
        into_another_bundle.run_the_removal_script_for("Apps/Tatolab.app");
        assert!(into_another_bundle.command_line_tool_link_remains());

        let without_a_link = MachineFilesUnderTest::with_the_cli_linked_to(None);
        without_a_link.run_the_removal_script_for("Apps/Tatolab.app");
        assert!(!without_a_link.command_line_tool_link_remains());
    }

    #[test]
    fn the_removal_script_matches_a_bundle_named_with_quotes_and_globs_literally() {
        let into_a_quoted_bundle = MachineFilesUnderTest::with_the_cli_linked_to(Some(
            "Apps/o'neil \"T\".app/Contents/MacOS/tatolab-cli",
        ));
        into_a_quoted_bundle.run_the_removal_script_for("Apps/o'neil \"T\".app");
        assert!(!into_a_quoted_bundle.command_line_tool_link_remains());

        let into_a_bundle_a_glob_would_match = MachineFilesUnderTest::with_the_cli_linked_to(Some(
            "Apps/Tatolab.app/Contents/MacOS/tatolab-cli",
        ));
        into_a_bundle_a_glob_would_match.run_the_removal_script_for("Apps/T*.app");
        assert!(into_a_bundle_a_glob_would_match.command_line_tool_link_remains());
    }

    #[test]
    fn only_an_unregistered_agent_lets_the_uninstall_go_on_past_run_tatolab() {
        assert_eq!(
            run_tatolab_turned_off(RunTatolabReconciliation::Unregistered),
            Ok(())
        );
        assert_eq!(
            run_tatolab_turned_off(RunTatolabReconciliation::UnregistrationFailed {
                failure_description: "Operation not permitted".to_string(),
            }),
            Err(
                "the runtime's launch agent could not be unregistered: Operation not permitted"
                    .to_string()
            )
        );
        for unexpected_reconciliation in [
            RunTatolabReconciliation::SwitchIsOff,
            RunTatolabReconciliation::AlreadyEnabled,
            RunTatolabReconciliation::NeedsApprovalInLoginItems {
                opened_login_items_settings: false,
            },
        ] {
            let refusal = run_tatolab_turned_off(unexpected_reconciliation.clone()).unwrap_err();
            assert!(
                refusal.contains(&format!("{unexpected_reconciliation:?}")),
                "{refusal}"
            );
        }
    }

    #[test]
    fn only_a_config_directory_named_for_the_app_is_removed() {
        let root = tempfile::tempdir().unwrap();
        let app_config_directory = root.path().join("com.tatolab.tatolab");
        std::fs::create_dir_all(&app_config_directory).unwrap();
        std::fs::write(app_config_directory.join("run-tatolab.json"), b"{}").unwrap();

        assert!(
            remove_the_app_config_directory_named_for(root.path(), "com.tatolab.tatolab")
                .unwrap_err()
                .contains("not named for the app's identifier")
        );
        assert!(root.path().exists());

        assert_eq!(
            remove_the_app_config_directory_named_for(&app_config_directory, "com.tatolab.tatolab"),
            Ok(())
        );
        assert!(!app_config_directory.exists());
        assert_eq!(
            remove_the_app_config_directory_named_for(&app_config_directory, "com.tatolab.tatolab"),
            Ok(()),
            "an absent config directory is already removed"
        );
    }
}
