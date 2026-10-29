# EduThemes interface direction

The visual reference is [conText](https://context.aideatext.ai/): a warm paper
background, compact serif headings, distinct work panels, quiet borders, and
clear separation between source material and the working area.

EduThemes keeps its own green book mark, green action color, existing language,
and research workflows. No reference-site logos, assets, or application code
are copied.

## Foundations

- Fraunces for display headings; IBM Plex Sans for controls and reading text.
  System serif and sans-serif fallbacks keep the apps usable before fonts load.
- Paper `#fbf8f3`, surface `#fffefd`, border `#dedfd6`, ink `#1c2c26`, and green
  actions `#22644c`.
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
