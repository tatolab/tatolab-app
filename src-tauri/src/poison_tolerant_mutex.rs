// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

//! The app's one way to lock a mutex and to wait on a condition variable: a thread that panicked
//! holding the lock leaves its value as it was, and the app keeps working from that value rather
//! than panicking in turn.

use std::sync::{Condvar, Mutex, MutexGuard, PoisonError};
use std::time::Duration;

/// Lock `mutex`, taking its value even when a thread panicked while holding it.
pub fn lock_ignoring_poison<T>(mutex: &Mutex<T>) -> MutexGuard<'_, T> {
    mutex.lock().unwrap_or_else(PoisonError::into_inner)
}

/// Wait on `condvar` with `guard`'s lock while `still_waiting` holds, for at most `wait_limit`,
/// taking the value even when a thread panicked while holding the lock.
pub fn wait_ignoring_poison_while<'guard, T>(
    condvar: &Condvar,
    guard: MutexGuard<'guard, T>,
    wait_limit: Duration,
    still_waiting: impl FnMut(&mut T) -> bool,
) -> MutexGuard<'guard, T> {
    match condvar.wait_timeout_while(guard, wait_limit, still_waiting) {
        Ok((guard, _wait_timeout_result)) => guard,
        Err(poisoned) => poisoned.into_inner().0,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::Arc;

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

    #[test]
    fn a_wait_answers_the_value_another_thread_set_and_notified() {
        let value_and_value_set = Arc::new((Mutex::new(None), Condvar::new()));
        let value_and_value_set_for_the_setter = Arc::clone(&value_and_value_set);
        let setter = std::thread::spawn(move || {
            let (value, value_set) = &*value_and_value_set_for_the_setter;
            *lock_ignoring_poison(value) = Some(7);
            value_set.notify_all();
        });

        let (value, value_set) = &*value_and_value_set;
        let guard = wait_ignoring_poison_while(
            value_set,
            lock_ignoring_poison(value),
            Duration::from_secs(60),
            |value| value.is_none(),
        );

        assert_eq!(*guard, Some(7));
        drop(guard);
        setter.join().unwrap();
    }

    #[test]
    fn a_wait_whose_limit_passes_answers_the_value_as_it_is() {
        let value = Mutex::new(None::<u32>);

        let guard = wait_ignoring_poison_while(
            &Condvar::new(),
            lock_ignoring_poison(&value),
            Duration::ZERO,
            |value| value.is_none(),
        );

        assert_eq!(*guard, None);
    }
}
