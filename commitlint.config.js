// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

// A pull request's title is the commit a squash merge writes: `type(scope): summary`.
export default {
  extends: ["@commitlint/config-conventional"],
  rules: {
    "type-enum": [2, "always", ["feat", "fix", "perf", "refactor", "docs", "chore", "test", "ci", "build", "revert"]],
    "header-max-length": [0],
    "subject-case": [0],
  },
};
