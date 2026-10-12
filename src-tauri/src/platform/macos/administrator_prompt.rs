// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

//! The macOS administrator prompt: one root shell script, run by `osascript`'s
//! `do shell script … with administrator privileges` behind the system's password dialog, and the
//! quoting that keeps every path one shell word inside one AppleScript string.

use std::path::Path;
use std::process::Command;

/// The interpreter that shows macOS's administrator prompt.
pub const OSASCRIPT_PATH: &str = "/usr/bin/osascript";

/// Why a script behind the administrator prompt did not run to its end.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum AdministratorPromptFailure {
    /// The user cancelled the prompt, so the script never ran.
    Cancelled,
    /// The prompt could not be shown, or the script failed.
    Failed { failure_description: String },
}

/// `value` as one single-quoted POSIX shell word.
pub fn single_quoted_shell_word(value: &str) -> String {
    format!("'{}'", value.replace('\'', r"'\''"))
}

/// `path` as one single-quoted POSIX shell word.
pub fn shell_word_for_path(path: &Path) -> String {
    single_quoted_shell_word(&path.to_string_lossy())
}

/// `value` as an AppleScript string literal.
pub fn applescript_string_literal(value: &str) -> String {
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
