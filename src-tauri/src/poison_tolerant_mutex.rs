// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

//! The app's one way to lock a mutex: a thread that panicked holding it leaves its value as it
//! was, and the tray keeps working from that value rather than panicking in turn.

use std::sync::{Mutex, MutexGuard, PoisonError};

/// Lock `mutex`, taking its value even when a thread panicked while holding it.
pub fn lock_ignoring_poison<T>(mutex: &Mutex<T>) -> MutexGuard<'_, T> {
    mutex.lock().unwrap_or_else(PoisonError::into_inner)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_poisoned_mutex_still_locks_with_its_value() {
        let mutex = Mutex::new(7);
        let _ = std::panic::catch_unwind(|| {
            let _guard = mutex.lock().unwrap();
            panic!("poison the mutex");
        });
        assert!(mutex.is_poisoned());

        assert_eq!(*lock_ignoring_poison(&mutex), 7);
    }
}
