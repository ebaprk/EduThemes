# shadcn/ui migration

The researcher and companion participant apps now use the same app-owned
shadcn/ui components from `packages/ui`. This replaces the researcher's React
Bootstrap controls and both apps' individually styled native controls with one
component source and one neutral token palette. The researcher no longer loads
Bootstrap or DaisyUI.

## Result

- Shared buttons, inputs, textareas, labels, checkboxes, native selects, badges,
  cards, tables, tabs, dialogs, tooltips, progress, and skeletons.
- A shared Radix-backed mobile navigation sheet in the researcher app.
- Compact controls and consistent focus states; 40px desktop and 44px phone
  actions, text wrapping for long labels, and contained table scrolling.
- Continuous dialog surfaces with compact titles and actions, including the
  participant preview. Large white header/footer bands stay removed.
- Report tabs retain their mounted content while switching tabs. Dialogs keep
  Escape dismissal and restore focus to the opening control.
- Existing loading skeleton layouts, pending labels, answers, retry handling,
  study routes, research workflow, and service contracts remain in use.

The neutral theme is defined in `packages/ui/src/theme.css`. Shared adaptations
and legacy token mapping are in `packages/ui/src/components.css`; app-specific
layouts remain in the owning apps. See the [UI package README](../packages/ui/README.md)
and [design system](design-system.md) for setup and conventions.

## Verification

Completed on November 17, 2026:

- Both production builds pass; both live local apps render the shared controls
  without runtime errors.
- 57 researcher and 23 participant unit tests pass.
- Four researcher workflow scenarios and both professor-deliverable scenarios
  pass, including imported-data reporting and independent per-theme kappa export.
- The complete screen diagnostic passes with strict page-width and visible
  form-name checks enabled. See the retained
  [verification results](../outputs/shadcn-ui-2026-11-17/verification.json) for
  screen counts and the known product behaviors recorded separately.

The screen diagnostic uses production builds with synthetic people, studies,
responses, and intercepted remote services. It performs no real account writes.
Build both apps before running:

```sh
cd frontend
UI_AUDIT_OUTPUT=frontend/test-results/shadcn/screens \
UI_AUDIT_STRICT_LAYOUT=1 UI_AUDIT_STRICT_ACCESSIBILITY=1 \
npm run test:ui:audit
```

The layout check rejects page-level horizontal overflow, while allowing tables
to scroll within their own panels. The form-name check excludes Radix's hidden
form inputs and inspects visible controls. The diagnostic also exercises
keyboard focus containment/restoration, reduced-motion skeletons, role-restricted
screens, import/coding/reporting, participant consent, screening, private links,
results, retries, and save conflicts.

Screenshots and machine-readable metrics are written to the ignored
`frontend/test-results/shadcn/screens` folder. Selected durable examples are in
`outputs/shadcn-ui-2026-11-17`.

## Remaining product findings

The [earlier audit](../outputs/ui-ux-audit-2026-11-16/audit.md) remains the product
backlog. In particular, this component migration does not resolve unsaved work
being discarded when leaving certain screens, ambiguous response-column import,
in-app correction of generated summaries, multi-theme CSV round trips, or saved
report links losing their selected tab. The diagnostic records these known
behaviors separately; successful screen walkthroughs do not mark them fixed.
