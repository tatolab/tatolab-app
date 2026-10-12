// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

//! Where this build expects the runtime's pieces on Linux: the local API socket, as StreamLib's
//! `streamlib-runtime-client-contract` resolves it (`streamlib_runtime_directory.rs`,
//! `machine_directories_test_root.rs`), and the CLI the installer links into `~/.local/bin`. A
//! local-proof build keeps the socket under its test root and reads no link. The machine runtime
//! lock is an abstract socket the runtime binds itself, so no path here names it.

use std::ffi::OsString;
use std::path::{Path, PathBuf};

use crate::platform::{
    local_api_socket_under_a_local_proof_test_root, per_user_streamlib_runtime_directory_under_tmp,
    LOCAL_API_SOCKET_FILE_NAME, LOCAL_PROOF_TEST_MACHINE_ROOT,
};

/// The folder the runtime keeps inside `$XDG_RUNTIME_DIR`.
const STREAMLIB_FOLDER_INSIDE_XDG_RUNTIME_DIR: &str = "streamlib";

/// Where the installer links the `tatolab` CLI, relative to `$HOME`.
const COMMAND_LINE_TOOL_LINK_INSIDE_HOME: &str = ".local/bin/tatolab";

/// Every path this build of the app reads on Linux.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TatolabMachinePathsOnLinux {
    pub local_api_socket: PathBuf,
    /// Where the installer links the CLI onto the PATH; `None` in a local-proof build, or with no
    /// home directory to look in.
    pub command_line_tool_link: Option<PathBuf>,
    /// The test root a local-proof build reads under; `None` for a real build.
    pub local_proof_test_machine_root: Option<PathBuf>,
}

impl TatolabMachinePathsOnLinux {
    /// The paths this build uses for the user with `uid`.
    pub fn for_this_build(uid: u32) -> Self {
        if cfg!(feature = "machine-directories-under-a-test-root") {
            Self::under_a_local_proof_test_root(Path::new(LOCAL_PROOF_TEST_MACHINE_ROOT))
        } else {
            Self::for_the_real_machine(
                std::env::var_os("XDG_RUNTIME_DIR"),
                std::env::var_os("HOME"),
                uid,
            )
        }
    }

    /// The real machine's paths for the user with `uid`, given `$XDG_RUNTIME_DIR` and `$HOME`:
    /// the socket in `$XDG_RUNTIME_DIR/streamlib/` when that is set and not empty, else in
    /// `/tmp/streamlib-<uid>/`.
    pub fn for_the_real_machine(
        xdg_runtime_dir: Option<OsString>,
        home_directory: Option<OsString>,
        uid: u32,
    ) -> Self {
        let runtime_directory = match xdg_runtime_dir.filter(|value| !value.is_empty()) {
            Some(xdg_runtime_dir) => {
                PathBuf::from(xdg_runtime_dir).join(STREAMLIB_FOLDER_INSIDE_XDG_RUNTIME_DIR)
            }
            None => per_user_streamlib_runtime_directory_under_tmp(uid),
        };
        Self {
            local_api_socket: runtime_directory.join(LOCAL_API_SOCKET_FILE_NAME),
            command_line_tool_link: home_directory
                .map(PathBuf::from)
                .filter(|home_directory| home_directory.is_absolute())
                .map(|home_directory| home_directory.join(COMMAND_LINE_TOOL_LINK_INSIDE_HOME)),
            local_proof_test_machine_root: None,
        }
    }

    /// The paths under `test_machine_root`, laid out as StreamLib's test-root build lays them.
    pub fn under_a_local_proof_test_root(test_machine_root: &Path) -> Self {
        Self {
            local_api_socket: local_api_socket_under_a_local_proof_test_root(test_machine_root),
            command_line_tool_link: None,
            local_proof_test_machine_root: Some(test_machine_root.to_path_buf()),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_socket_is_in_the_users_runtime_directory_as_the_runtime_resolves_it() {
        let paths = TatolabMachinePathsOnLinux::for_the_real_machine(
            Some(OsString::from("/run/user/1000")),
            Some(OsString::from("/home/jonathan")),
            1000,
        );
        assert_eq!(
            paths,
            TatolabMachinePathsOnLinux {
                local_api_socket: PathBuf::from("/run/user/1000/streamlib/local-api.sock"),
                command_line_tool_link: Some(PathBuf::from("/home/jonathan/.local/bin/tatolab")),
                local_proof_test_machine_root: None,
            }
        );
    }

    #[test]
    fn without_a_runtime_directory_the_socket_falls_back_to_the_per_user_tmp_folder() {
        for xdg_runtime_dir in [None, Some(OsString::new())] {
            let paths = TatolabMachinePathsOnLinux::for_the_real_machine(
                xdg_runtime_dir,
                Some(OsString::from("/home/jonathan")),
                1000,
            );
            assert_eq!(
                paths.local_api_socket,
                PathBuf::from("/tmp/streamlib-1000/local-api.sock")
            );
        }
    }

    #[test]
    fn no_home_or_a_relative_one_names_no_cli_link() {
        for home_directory in [None, Some(OsString::from("relative/home"))] {
            let paths = TatolabMachinePathsOnLinux::for_the_real_machine(
                Some(OsString::from("/run/user/1000")),
                home_directory,
                1000,
            );
            assert_eq!(paths.command_line_tool_link, None);
        }
    }

    #[test]
    fn a_local_proof_build_reads_the_socket_under_its_test_root_and_no_cli_link() {
        assert_eq!(
            TatolabMachinePathsOnLinux::under_a_local_proof_test_root(Path::new(
                "/tmp/tatolab-proof"
            )),
            TatolabMachinePathsOnLinux {
                local_api_socket: PathBuf::from("/tmp/tatolab-proof/run/local-api.sock"),
                command_line_tool_link: None,
                local_proof_test_machine_root: Some(PathBuf::from("/tmp/tatolab-proof")),
            }
        );
    }
}
