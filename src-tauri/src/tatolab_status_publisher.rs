// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

//! Polls the status every couple of seconds on its own thread and publishes each change to the
//! tray menu.

use std::sync::mpsc::{self, Receiver, RecvTimeoutError, Sender};
use std::sync::{Arc, Mutex, OnceLock};
use std::time::{Duration, Instant};

use crate::named_app_thread::spawn_named_app_thread;
use crate::poison_tolerant_mutex::lock_ignoring_poison;
use crate::tatolab_app_controller::TatolabAppController;
use crate::tatolab_status::TatolabStatus;
use crate::tatolab_tray_menu::TatolabTrayMenu;

/// How often the poller observes the runtime when nothing asks it to sooner.
const STATUS_POLL_INTERVAL: Duration = Duration::from_secs(2);

/// The last status published, and where each change goes.
pub struct TatolabStatusPublisher {
    controller: Arc<TatolabAppController>,
    last_published_status: Mutex<Option<TatolabStatus>>,
    tray_menu: OnceLock<TatolabTrayMenu>,
    refresh_now_sender: Sender<()>,
    refresh_now_receiver: Mutex<Option<Receiver<()>>>,
}

impl TatolabStatusPublisher {
    /// A publisher of `controller`'s status, polling once [`Self::start_polling`] is called.
    pub fn new(controller: Arc<TatolabAppController>) -> Self {
        let (refresh_now_sender, refresh_now_receiver) = mpsc::channel();
        Self {
            controller,
            last_published_status: Mutex::new(None),
            tray_menu: OnceLock::new(),
            refresh_now_sender,
            refresh_now_receiver: Mutex::new(Some(refresh_now_receiver)),
        }
    }

    /// Hand the tray menu every later change.
    pub fn attach_tray_menu(&self, tray_menu: TatolabTrayMenu) {
        if let Some(last_published_status) =
            lock_ignoring_poison(&self.last_published_status).as_ref()
        {
            tray_menu.show_status(last_published_status);
        }
        if self.tray_menu.set(tray_menu).is_err() {
            tracing::warn!("the tray menu was attached twice; keeping the first");
        }
    }

    /// The poller's one round: observe everything, react to an agent needing approval or a runtime
    /// that is down, and publish the status if it changed. Everyone else asks for a round with
    /// [`Self::request_refresh`].
    fn refresh_and_publish(&self) {
        let now = Instant::now();
        let status = self.controller.compose_status(now);
        self.controller
            .open_login_items_if_the_runtime_agent_needs_approval(status.runtime_agent);
        self.controller
            .start_the_runtime_if_the_poller_found_it_down(&status, now);
        let mut last_published_status = lock_ignoring_poison(&self.last_published_status);
        if last_published_status.as_ref() != Some(&status) {
            tracing::info!(
                runtime_state = ?status.runtime_state,
                runtime_agent = ?status.runtime_agent,
                run_tatolab = status.run_tatolab,
                stream_count = ?status.stream_count,
                machine_setup_state = ?status.machine_setup_state,
                "Tatolab status changed"
            );
            if let Some(tray_menu) = self.tray_menu.get() {
                tray_menu.show_status(&status);
            }
            *last_published_status = Some(status);
        }
    }

    /// Ask the poller to observe again now rather than at its next interval.
    pub fn request_refresh(&self) {
        let _poller_gone_means_the_app_is_exiting = self.refresh_now_sender.send(());
    }

    /// Start the poller thread; a second call starts nothing.
    pub fn start_polling(self: &Arc<Self>) {
        let Some(refresh_now_receiver) = lock_ignoring_poison(&self.refresh_now_receiver).take()
        else {
            return;
        };
        let publisher = Arc::clone(self);
        spawn_named_app_thread("tatolab-status-poller", move || loop {
            publisher.refresh_and_publish();
            if !wait_for_the_next_status_round(&refresh_now_receiver, STATUS_POLL_INTERVAL) {
                return;
            }
        });
    }
}

/// Wait up to `poll_interval` for a refresh request, then take every other request already
/// queued, so a burst of requests asks for one round; whether another round should run.
fn wait_for_the_next_status_round(
    refresh_now_receiver: &Receiver<()>,
    poll_interval: Duration,
) -> bool {
    match refresh_now_receiver.recv_timeout(poll_interval) {
        Ok(()) => {
            refresh_now_receiver.try_iter().for_each(drop);
            true
        }
        Err(RecvTimeoutError::Timeout) => true,
        Err(RecvTimeoutError::Disconnected) => false,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::mpsc::TryRecvError;

    #[test]
    fn a_burst_of_refresh_requests_collapses_into_one_round() {
        let (refresh_now_sender, refresh_now_receiver) = mpsc::channel();
        for _ in 0..3 {
            refresh_now_sender.send(()).unwrap();
        }

        assert!(wait_for_the_next_status_round(
            &refresh_now_receiver,
            STATUS_POLL_INTERVAL
        ));
        assert_eq!(refresh_now_receiver.try_recv(), Err(TryRecvError::Empty));
    }

    #[test]
    fn no_more_rounds_once_every_requester_is_gone() {
        let (refresh_now_sender, refresh_now_receiver) = mpsc::channel::<()>();
        drop(refresh_now_sender);

        assert!(!wait_for_the_next_status_round(
            &refresh_now_receiver,
            STATUS_POLL_INTERVAL
        ));
    }
}
