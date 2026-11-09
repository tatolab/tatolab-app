import stylelint from "stylelint";

const NO_DOT_INDICATORS = "No dot indicators in the window: status is a word, and a problem is an icon.";
const SMALL_SIZE = String.raw`(0\.5|1|1\.5|2|2\.5|3)`;
const DOT_CLASS_LISTS = [
  new RegExp(String.raw`\banimate-(ping|pulse|breathe)\b`),
  new RegExp(String.raw`^(?=.*\brounded-full\b)(?=.*\bsize-${SMALL_SIZE}\b)`),
  new RegExp(String.raw`^(?=.*\brounded-full\b)(?=.*\bw-${SMALL_SIZE}\b)(?=.*\bh-${SMALL_SIZE}\b)`),
];

// Tailwind's `@apply` takes class names, which no core rule reads: a pulse or a dot applied there.
const noDotIndicatorsAppliedByTailwind = stylelint.createPlugin("tatolab/no-dot-indicators-in-apply", () => (stylesheetRoot, lintResult) => {
  stylesheetRoot.walkAtRules("apply", (applyAtRule) => {
    if (DOT_CLASS_LISTS.some((dotClassList) => dotClassList.test(applyAtRule.params))) {
      stylelint.utils.report({ ruleName: "tatolab/no-dot-indicators-in-apply", result: lintResult, node: applyAtRule, message: NO_DOT_INDICATORS });
    }
  });
});

export default {
  plugins: [noDotIndicatorsAppliedByTailwind],
  rules: {
    "declaration-property-value-disallowed-list": [
      { "/.*/": ["/[•●◉⬤]/", "/\\b(ping|pulse|breathe)\\b/"] },
      { message: NO_DOT_INDICATORS },
    ],
    "selector-disallowed-list": [["/animate-(ping|pulse|breathe)/"], { message: NO_DOT_INDICATORS }],
    "tatolab/no-dot-indicators-in-apply": true,
  },
};
