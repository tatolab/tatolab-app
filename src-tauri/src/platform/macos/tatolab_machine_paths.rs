// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

//! Where this build expects the runtime's machine-wide pieces: the machine runtime lock, the
//! local API socket, and the PATH link to the bundled CLI. The paths mirror StreamLib's
//! `streamlib-runtime-client-contract` (`machine_runtime_lock.rs`,
//! `streamlib_runtime_directory.rs`, `machine_directories_test_root.rs`); a local-proof build
//! keeps all of them under one test root and never touches `/Library` or `/usr/local/bin`.

use std::path::{Path, PathBuf};

use crate::platform::LOCAL_PROOF_TEST_MACHINE_ROOT;

/// The root-owned directory the real machine runtime lock sits in.
pub const MACHINE_RUNTIME_LOCK_DIRECTORY_ON_MACOS: &str = "/Library/Application Support/Tatolab";

/// The lock file's name inside its directory.
pub const MACHINE_RUNTIME_LOCK_FILE_NAME: &str = "runtime.lock";

/// Where first launch links the `tatolab` CLI onto the PATH.
pub const COMMAND_LINE_TOOL_LINK_PATH: &str = "/usr/local/bin/tatolab";

/// The shared temporary directory the runtime's per-user runtime directory sits in on macOS.
const SHARED_TEMPORARY_DIRECTORY: &str = "/tmp";

/// The CLI's file name beside the app binary in `Contents/MacOS/`. Not `tatolab`: a default APFS
/// volume folds case, so that name would overwrite the app's own `Tatolab`.
const BUNDLED_COMMAND_LINE_TOOL_FILE_NAME: &str = "tatolab-cli";

/// Who must own the machine runtime lock and its directory.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum MachineRuntimeLockOwner {
    /// The real lock: root-owned, created behind one administrator prompt.
    Root,
    /// A local-proof lock: owned by the user running the app, created with no prompt.
    ThisUser { uid: u32 },
}

impl MachineRuntimeLockOwner {
    /// The uid the lock and its directory must be owned by.
    pub fn uid(self) -> u32 {
        match self {
            MachineRuntimeLockOwner::Root => 0,
            MachineRuntimeLockOwner::ThisUser { uid } => uid,
        }
    }
}

/// Every machine-wide path this build of the app reads or prepares.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TatolabMachinePathsOnMacos {
    pub machine_runtime_lock_directory: PathBuf,
    pub machine_runtime_lock_file: PathBuf,
    pub machine_runtime_lock_owner: MachineRuntimeLockOwner,
    pub local_api_socket: PathBuf,
    /// Where the CLI is linked onto the PATH; `None` when this build links nothing.
    pub command_line_tool_link: Option<PathBuf>,
    /// The test root a local-proof build prepares; `None` for a real build.
    pub local_proof_test_machine_root: Option<PathBuf>,
}

impl TatolabMachinePathsOnMacos {
    /// The paths this build uses for the user with `uid`.
    pub fn for_this_build(uid: u32) -> Self {
        if cfg!(feature = "machine-directories-under-a-test-root") {
            Self::under_a_local_proof_test_root(Path::new(LOCAL_PROOF_TEST_MACHINE_ROOT), uid)
        } else {
            Self::for_the_real_machine(uid)
        }
    }

    /// The real machine's paths for the user with `uid`.
    pub fn for_the_real_machine(uid: u32) -> Self {
        let machine_runtime_lock_directory = PathBuf::from(MACHINE_RUNTIME_LOCK_DIRECTORY_ON_MACOS);
        Self {
            machine_runtime_lock_file: machine_runtime_lock_directory
                .join(MACHINE_RUNTIME_LOCK_FILE_NAME),
            machine_runtime_lock_directory,
            machine_runtime_lock_owner: MachineRuntimeLockOwner::Root,
            local_api_socket: Path::new(SHARED_TEMPORARY_DIRECTORY)
                .join(format!("streamlib-{uid}"))
                .join("local-api.sock"),
            command_line_tool_link: Some(PathBuf::from(COMMAND_LINE_TOOL_LINK_PATH)),
            local_proof_test_machine_root: None,
        }
    }

    /// The paths under `test_machine_root`, laid out as StreamLib's test-root build lays them.
    pub fn under_a_local_proof_test_root(test_machine_root: &Path, uid: u32) -> Self {
        let machine_runtime_lock_directory = test_machine_root.join("lock");
        Self {
            machine_runtime_lock_file: machine_runtime_lock_directory
                .join(MACHINE_RUNTIME_LOCK_FILE_NAME),
            machine_runtime_lock_directory,
            machine_runtime_lock_owner: MachineRuntimeLockOwner::ThisUser { uid },
            local_api_socket: test_machine_root.join("run").join("local-api.sock"),
            command_line_tool_link: None,
            local_proof_test_machine_root: Some(test_machine_root.to_path_buf()),
        }
    }
}

/// The CLI inside the bundle this app binary runs from, when it runs from `Contents/MacOS/` of a
/// bundle that carries one.
pub fn bundled_command_line_tool_path() -> Option<PathBuf> {
    let app_executable = std::env::current_exe().ok()?.canonicalize().ok()?;
    bundled_command_line_tool_beside(&app_executable).filter(|path| path.is_file())
}

/// `<bundle>/Contents/MacOS/tatolab-cli` for an executable in `<bundle>/Contents/MacOS/`.
fn bundled_command_line_tool_beside(app_executable: &Path) -> Option<PathBuf> {
    let macos_directory = app_executable.parent()?;
    let contents_directory = macos_directory.parent()?;
    if macos_directory.file_name()? != "MacOS" || contents_directory.file_name()? != "Contents" {
        return None;
    }
    Some(macos_directory.join(BUNDLED_COMMAND_LINE_TOOL_FILE_NAME))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_real_machine_paths_match_the_runtimes() {
        let paths = TatolabMachinePathsOnMacos::for_the_real_machine(501);
        assert_eq!(
            paths.machine_runtime_lock_file,
            PathBuf::from("/Library/Application Support/Tatolab/runtime.lock")
        );
        assert_eq!(paths.machine_runtime_lock_owner.uid(), 0);
        assert_eq!(
            paths.local_api_socket,
            PathBuf::from("/tmp/streamlib-501/local-api.sock")
        );
        assert_eq!(
            paths.command_line_tool_link,
            Some(PathBuf::from("/usr/local/bin/tatolab"))
        );
        assert_eq!(paths.local_proof_test_machine_root, None);
    }

    #[test]
    fn a_local_proof_build_keeps_every_path_under_its_test_root_and_links_nothing() {
        let paths = TatolabMachinePathsOnMacos::under_a_local_proof_test_root(
            Path::new("/tmp/tatolab-proof"),
            501,
        );
        assert_eq!(
            paths.machine_runtime_lock_directory,
            PathBuf::from("/tmp/tatolab-proof/lock")
        );
        assert_eq!(
            paths.machine_runtime_lock_file,
            PathBuf::from("/tmp/tatolab-proof/lock/runtime.lock")
        );
        assert_eq!(
            paths.machine_runtime_lock_owner,
            MachineRuntimeLockOwner::ThisUser { uid: 501 }
        );
        assert_eq!(
            paths.local_api_socket,
            PathBuf::from("/tmp/tatolab-proof/run/local-api.sock")
        );
        assert_eq!(paths.command_line_tool_link, None);
    }

    #[test]
    fn the_bundled_cli_is_found_only_beside_an_app_binary_in_contents_macos() {
        assert_eq!(
            bundled_command_line_tool_beside(Path::new(
                "/Applications/Tatolab.app/Contents/MacOS/Tatolab"
            )),
            Some(PathBuf::from(
                "/Applications/Tatolab.app/Contents/MacOS/tatolab-cli"
            ))
        );
        assert_eq!(
            bundled_command_line_tool_beside(Path::new("/repo/src-tauri/target/debug/Tatolab")),
            None
        );
    }
}
