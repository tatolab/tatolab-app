// A pull request's title is the commit a squash merge writes: `type(scope): summary`.
export default {
  extends: ["@commitlint/config-conventional"],
  defaultIgnores: false,
  rules: {
    "type-enum": [2, "always", ["feat", "fix", "perf", "refactor", "docs", "chore", "test", "ci", "build", "revert"]],
    "scope-case": [2, "always", "lower-case"],
    "header-max-length": [0],
    "subject-case": [0],
  },
};
