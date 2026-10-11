// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

//! The app's one way to start a thread: named, so it reads in a sample or a crash report, and a
//! thread the OS refuses is logged rather than panicking the tray.

/// Run `work` on a new thread named `thread_name`, logging when the thread cannot be started.
pub fn spawn_named_app_thread(thread_name: &str, work: impl FnOnce() + Send + 'static) {
    if let Err(failure) = std::thread::Builder::new()
        .name(thread_name.to_string())
        .spawn(work)
    {
        tracing::error!(%failure, thread_name, "a Tatolab app thread could not be started");
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::mpsc;

    #[test]
    fn the_work_runs_on_a_thread_with_the_given_name() {
        let (thread_name_sender, thread_name_receiver) = mpsc::channel();

        spawn_named_app_thread("tatolab-test-thread", move || {
            let thread_name = std::thread::current().name().map(str::to_string);
            thread_name_sender.send(thread_name).unwrap();
        });

        assert_eq!(
            thread_name_receiver.recv().unwrap().as_deref(),
            Some("tatolab-test-thread")
        );
    }
}
