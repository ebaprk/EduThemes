# EduThemes interface direction

The visual reference is [conText](https://context.aideatext.ai/): a warm paper
background, compact serif headings, distinct work panels, quiet borders, and
clear separation between source material and the working area.

EduThemes keeps its own green book mark, existing language,
and research workflows. No reference-site logos, assets, or application code
are copied.

## Foundations

- Fraunces for display headings; IBM Plex Sans for controls and reading text.
  System serif and sans-serif fallbacks keep the apps usable before fonts load.
- Paper `#fbf8f3`, white surfaces `#ffffff`, warm panels `#f2eee6`, borders
  `#e5dfd4`, charcoal ink and actions `#16202b`, and muted text `#4e5a68`.
- Blue accents `#0b7ec5`, with deeper blue `#0a5c92` for readable links.
  Inputs, progress bars, selection, and keyboard focus share these accents.
- Warm gray skeletons `#e8e3da`; the green book icon remains the brand mark.
- Compact controls, subtle 14px panel corners, and no decorative card shadows.
- A study-information rail beside responses and saved evidence on desktop.
- Participant activities beside private return controls and study details.
- Stacked panels at narrower widths; independent table scrolling where needed.
- Visible keyboard focus, mobile touch targets, and reduced-motion support.

The researcher stylesheet is `frontend/src/styles/ContextTheme.css`; shared
visual foundations are mirrored in the independent participant repository's
`src/styles/ContextTheme.css`. Keep the shared foundations aligned.

Every asynchronous state continues to use `LoadingSkeleton` or the shared
button skeleton. Background refreshes retain existing content and entered work.
Route and activity changes open at the top without moving the page during
background saves or refreshes.

This update changes presentation and page framing. Study roles, consent,
versioning, private return keys, analysis, and database contracts are unchanged.
