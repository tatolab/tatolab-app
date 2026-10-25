// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

const NO_DOT_INDICATORS = "No dot indicators in the window: status is a word, and a problem is an icon.";

export default {
  rules: {
    "declaration-property-value-disallowed-list": [
      { "/.*/": ["/[•●◉⬤]/", "/\\b(ping|pulse|breathe)\\b/"] },
      { message: NO_DOT_INDICATORS },
    ],
    "selector-disallowed-list": [["/animate-(ping|pulse|breathe)/"], { message: NO_DOT_INDICATORS }],
  },
};
