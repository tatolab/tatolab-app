// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

/** A stroked line icon on the 24-unit grid every icon in the window is drawn on. */
function lineIcon(paths: string): string {
  return `<svg class="line-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;
}

export const GEAR_ICON_SVG = lineIcon(
  `<path d="M18.69 9.95 21.03 10.24 21.03 13.76 18.69 14.05 18.18 15.29 19.63 17.14 17.14 19.63 15.29 18.18 14.05 18.69 13.76 21.03 10.24 21.03 9.95 18.69 8.71 18.18 6.86 19.63 4.37 17.14 5.82 15.29 5.31 14.05 2.97 13.76 2.97 10.24 5.31 9.95 5.82 8.71 4.37 6.86 6.86 4.37 8.71 5.82 9.95 5.31 10.24 2.97 13.76 2.97 14.05 5.31 15.29 5.82 17.14 4.37 19.63 6.86 18.18 8.71Z"/><circle cx="12" cy="12" r="3"/>`,
);

export const SEARCH_ICON_SVG = lineIcon(`<circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.4-4.4"/>`);

export const COPY_ICON_SVG = lineIcon(
  `<rect x="8.5" y="8.5" width="11.5" height="11.5" rx="2"/><path d="M15.5 8.5V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v7.5a2 2 0 0 0 2 2h2.5"/>`,
);

export const CHECK_ICON_SVG = lineIcon(`<path d="M19.5 6.5 9.5 17 4.5 12"/>`);

/** Every failure, as Lucide's square-x: 14 px inline, 16 px in blocks, 20 px beside headings. */
export const FAILURE_ICON_SVG = lineIcon(`<rect width="18" height="18" x="3" y="3" rx="2"/><path d="m15 9-6 6"/><path d="m9 9 6 6"/>`);

export const EYE_ICON_SVG = lineIcon(
  `<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z"/><circle cx="12" cy="12" r="3"/>`,
);

export const CLOSE_ICON_SVG = lineIcon(`<path d="M17.5 6.5l-11 11M6.5 6.5l11 11"/>`);

export const TERMINAL_ICON_SVG = lineIcon(
  `<rect x="3" y="4.5" width="18" height="15" rx="2.5"/><path d="m7.5 9.5 2.75 2.5-2.75 2.5"/><path d="M13 15h3.5"/>`,
);

export const LOCK_ICON_SVG = lineIcon(`<rect x="5" y="10.5" width="14" height="10" rx="2"/><path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5"/>`);

export const POWER_ICON_SVG = lineIcon(`<path d="M12 3.5v8"/><path d="M6.6 6.8a7.5 7.5 0 1 0 10.8 0"/>`);

export const TRASH_ICON_SVG = lineIcon(
  `<path d="M4.5 7h15"/><path d="M9.5 7V4.5h5V7"/><path d="M6.5 7l.9 11.6a2 2 0 0 0 2 1.9h5.2a2 2 0 0 0 2-1.9L17.5 7"/>`,
);

export const FOLLOW_ICON_SVG = lineIcon(`<path d="M12 4v11"/><path d="m7 10.5 5 5 5-5"/><path d="M5 19.5h14"/>`);

export const ARROW_DOWN_ICON_SVG = lineIcon(`<path d="M12 5v13.5"/><path d="m6.5 13 5.5 5.5 5.5-5.5"/>`);

export const GRAPH_ICON_SVG = lineIcon(
  `<rect x="3" y="9.5" width="6" height="5" rx="1.5"/><rect x="15" y="4" width="6" height="5" rx="1.5"/><rect x="15" y="15" width="6" height="5" rx="1.5"/><path d="M9 12h2.5a1.5 1.5 0 0 0 1.5-1.5v-2A1.5 1.5 0 0 1 14.5 7H15M13 12v3.5a1.5 1.5 0 0 0 1.5 1.5H15"/>`,
);

export const LOGS_ICON_SVG = lineIcon(`<path d="M4.5 6.5h15M4.5 12h15M4.5 17.5h9"/>`);

export const OVERVIEW_ICON_SVG = lineIcon(`<rect x="4" y="4.5" width="16" height="15" rx="2.5"/><path d="M8 9.5h8M8 13h8M8 16.5h5"/>`);

export const STREAM_ICON_SVG = lineIcon(`<path d="M3.5 12h4l2.5-5 4 10 2.5-5h4"/>`);

/** A folder with a check: what an uninstall leaves in place. */
export const KEPT_RECORDS_ICON_SVG = lineIcon(
  `<path d="M3.5 7.5a2 2 0 0 1 2-2h3.6l2 2h7.4a2 2 0 0 1 2 2v7.5a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2Z"/><path d="m9 13 2 2 4-4"/>`,
);

/** The flat brand mark: the Tatolab blue with a white T. */
export const TATOLAB_MARK_SVG = `<svg class="tatolab-mark" viewBox="0 0 64 64" aria-hidden="true"><rect width="64" height="64" rx="16" fill="#2a5bff"/><path d="M19 22h26M32 22v23" stroke="#fff" stroke-width="7" stroke-linecap="round" fill="none"/></svg>`;
