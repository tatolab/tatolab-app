// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

//! A condition the app checks every round and logs only on the round it starts holding, so a
//! failure that persists is logged once rather than every round.

use std::sync::atomic::{AtomicBool, Ordering};

/// Whether a condition held the last time it was checked.
#[derive(Debug, Default)]
pub struct ConditionOnsetLatch {
    condition_held_last_time: AtomicBool,
}

impl ConditionOnsetLatch {
    /// Record whether the condition holds now, answering whether this is the check it started
    /// holding on: true the first time it holds, and again only after a check it did not.
    pub fn condition_just_started_holding(&self, condition_holds_now: bool) -> bool {
        let condition_held_last_time = self
            .condition_held_last_time
            .swap(condition_holds_now, Ordering::AcqRel);
        condition_holds_now && !condition_held_last_time
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_condition_starts_holding_on_its_first_check_and_again_only_after_it_stopped() {
        let condition_onset_latch = ConditionOnsetLatch::default();

        let onsets: Vec<bool> = [true, true, false, false, true, true]
            .into_iter()
            .map(|condition_holds_now| {
                condition_onset_latch.condition_just_started_holding(condition_holds_now)
            })
            .collect();

        assert_eq!(onsets, vec![true, false, false, false, true, false]);
    }
}
