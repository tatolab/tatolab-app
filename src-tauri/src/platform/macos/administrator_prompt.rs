// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

//! The macOS administrator prompt: one root shell script, run by `osascript`'s
//! `do shell script … with administrator privileges` behind the system's password dialog, and the
//! quoting that keeps every path one shell word inside one AppleScript string.

use std::path::Path;
use std::process::Command;

/// The interpreter that shows macOS's administrator prompt.
const OSASCRIPT_PATH: &str = "/usr/bin/osascript";

/// Why a script behind the administrator prompt did not run to its end.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum AdministratorPromptFailure {
    /// The user cancelled the prompt, so the script never ran.
    Cancelled,
    /// The prompt could not be shown, or the script failed.
    Failed { failure_description: String },
}

/// `value` as one single-quoted POSIX shell word.
fn single_quoted_shell_word(value: &str) -> String {
    format!("'{}'", value.replace('\'', r"'\''"))
}

/// `path` as one single-quoted POSIX shell word.
pub fn shell_word_for_path(path: &Path) -> String {
    single_quoted_shell_word(&path.to_string_lossy())
}

/// `value` as an AppleScript string literal.
fn applescript_string_literal(value: &str) -> String {
    format!("\"{}\"", value.replace('\\', r"\\").replace('"', "\\\""))
}

/// The AppleScript that runs `shell_script` as root behind the administrator prompt, which shows
/// `prompt_text` under "Tatolab wants to make changes."
pub fn administrator_prompt_applescript(shell_script: &str, prompt_text: &str) -> String {
    format!(
        "do shell script {} with prompt {} with administrator privileges",
        applescript_string_literal(shell_script),
        applescript_string_literal(prompt_text)
    )
}

/// Run `shell_script` as root behind one administrator prompt showing `prompt_text`, blocking
/// until the user answers it.
pub fn run_behind_one_administrator_prompt(
    shell_script: &str,
    prompt_text: &str,
) -> Result<(), AdministratorPromptFailure> {
    let osascript_output = Command::new(OSASCRIPT_PATH)
        .arg("-e")
        .arg(administrator_prompt_applescript(shell_script, prompt_text))
        .output()
        .map_err(|failure| AdministratorPromptFailure::Failed {
            failure_description: format!("{OSASCRIPT_PATH} could not be started: {failure}"),
        })?;
    if osascript_output.status.success() {
        return Ok(());
    }
    let osascript_stderr = String::from_utf8_lossy(&osascript_output.stderr);
    // -128 is AppleScript's userCanceledErr.
    if osascript_stderr.contains("(-128)") {
        return Err(AdministratorPromptFailure::Cancelled);
    }
    Err(AdministratorPromptFailure::Failed {
        failure_description: format!("{} ({})", osascript_stderr.trim(), osascript_output.status),
    })
}

#[cfg(test)]
mod tests {
    use std::path::PathBuf;

    use super::*;
    use crate::platform::macos::machine_setup::{
        machine_setup_administrator_shell_script, MissingMachineSetupPiece,
    };
    use crate::platform::macos::tatolab_uninstall::tatolab_uninstall_administrator_shell_script;

    /// What `osascript` answers for `applescript`, its trailing newline dropped.
    fn osascript_answer(applescript: &str) -> String {
        let output = Command::new(OSASCRIPT_PATH)
            .arg("-e")
            .arg(applescript)
            .output()
            .unwrap();
        assert!(output.status.success(), "{applescript}: {output:?}");
        let answer = String::from_utf8(output.stdout).unwrap();
        answer
            .strip_suffix('\n')
            .map(str::to_string)
            .unwrap_or(answer)
    }

    #[test]
    fn every_administrator_script_round_trips_through_osascript_unchanged() {
        let bundle_with_quotes_backslashes_and_globs =
            Path::new("/Users/o'neil/Apps/\"Tatolab\" \\ $HOME * copy.app");
        let machine_setup_script = machine_setup_administrator_shell_script(&[
            MissingMachineSetupPiece::CommandLineToolLink {
                link_path: PathBuf::from("/usr/local/bin/tatolab"),
                bundled_command_line_tool: bundle_with_quotes_backslashes_and_globs
                    .join("Contents/MacOS/tatolab-cli"),
            },
        ]);
        let uninstall_script = tatolab_uninstall_administrator_shell_script(
            Some(Path::new("/usr/local/bin/tatolab")),
            bundle_with_quotes_backslashes_and_globs,
            Path::new("/Library/Application Support/Tatolab"),
        );
        for shell_script in [machine_setup_script, uninstall_script] {
            assert_eq!(
                osascript_answer(&format!(
                    "return {}",
                    applescript_string_literal(&shell_script)
                )),
                shell_script
            );
        }

        for value in [
            "o'neil",
            "''",
            "\"double quoted\"",
            "back\\slash \\\"",
            "$HOME `id` $(id) * ? [a] ~",
            "Ünïcödé ✓",
            "",
        ] {
            let shell_script = format!("printf %s {}", single_quoted_shell_word(value));
            assert_eq!(
                osascript_answer(&format!(
                    "do shell script {}",
                    applescript_string_literal(&shell_script)
                )),
                value,
                "{shell_script}"
            );
        }
    }
}
