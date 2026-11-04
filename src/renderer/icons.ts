/** A stroked line icon on the 24-unit grid every icon in the window is drawn on. */
function lineIcon(paths: string): string {
  return `<svg class="line-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;
}

export const COPY_ICON_SVG = lineIcon(
  `<rect x="8.5" y="8.5" width="11.5" height="11.5" rx="2"/><path d="M15.5 8.5V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v7.5a2 2 0 0 0 2 2h2.5"/>`,
);

export const CHECK_ICON_SVG = lineIcon(`<path d="M19.5 6.5 9.5 17 4.5 12"/>`);

export const CLOSE_ICON_SVG = lineIcon(`<path d="M17.5 6.5l-11 11M6.5 6.5l11 11"/>`);

export const TERMINAL_ICON_SVG = lineIcon(
  `<rect x="3" y="4.5" width="18" height="15" rx="2.5"/><path d="m7.5 9.5 2.75 2.5-2.75 2.5"/><path d="M13 15h3.5"/>`,
);

export const POWER_ICON_SVG = lineIcon(`<path d="M12 3.5v8"/><path d="M6.6 6.8a7.5 7.5 0 1 0 10.8 0"/>`);

export const TRASH_ICON_SVG = lineIcon(
  `<path d="M4.5 7h15"/><path d="M9.5 7V4.5h5V7"/><path d="M6.5 7l.9 11.6a2 2 0 0 0 2 1.9h5.2a2 2 0 0 0 2-1.9L17.5 7"/>`,
);

/** A folder with a check: what an uninstall leaves in place. */
export const KEPT_RECORDS_ICON_SVG = lineIcon(
  `<path d="M3.5 7.5a2 2 0 0 1 2-2h3.6l2 2h7.4a2 2 0 0 1 2 2v7.5a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2Z"/><path d="m9 13 2 2 4-4"/>`,
);

/** The flat brand mark: the Tatolab blue with a white T. */
export const TATOLAB_MARK_SVG = `<svg class="tatolab-mark" viewBox="0 0 64 64" aria-hidden="true"><rect width="64" height="64" rx="16" fill="#2a5bff"/><path d="M19 22h26M32 22v23" stroke="#fff" stroke-width="7" stroke-linecap="round" fill="none"/></svg>`;
