# UI conventions

- Use `LoadingSkeleton` for every loading or waiting state, including route and
  authentication checks, fetched panels, suggestions, and analysis generation.
  Match the skeleton to the content being loaded; do not show a blank screen,
  text-only loading message, or spinner-only placeholder.
- For pending actions, use the shared `Skeleton` button indicator with a clear
  action label and `aria-busy`. Keep existing content and entered answers intact
  during background refreshes and saves.
- Keep loading separate from genuine empty and error states. Do not briefly show
  “no studies,” “unavailable,” or “no summary” before the relevant request settles.
- Hide decorative placeholders from assistive technology, provide an accessible
  status label, and respect reduced-motion preferences.
- Apply these conventions to the researcher and companion participant apps.
