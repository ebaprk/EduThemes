# EduThemes UI

Shared, app-owned [shadcn/ui](https://ui.shadcn.com/) component source for the
researcher and companion participant apps. Components were installed with the
official CLI using the New York style, neutral tokens, JavaScript, and Radix.
They are actual components, rather than an imitation of their appearance.

## Setup

The researcher app depends on `file:../packages/ui`. The sibling
`EduThemes-Participant` project depends on `file:../EduThemes/packages/ui`.
Keep the two checkouts beside one another, or update the participant dependency
when moving it. Install the shared package before the apps:

```sh
npm ci --prefix packages/ui
npm ci --prefix frontend
npm ci --prefix ../EduThemes-Participant
```

Both Vite configurations deduplicate React and React DOM. Both Tailwind entry
stylesheets scan this package's source with `@source`, import `theme.css`, and
load `components.css` after the existing page styles. The root document carries
`data-ui="shadcn"` so shared overrides remain explicit.

## Usage and ownership

```jsx
import { Button } from '@eduthemes/ui/components/button';
import { Input } from '@eduthemes/ui/components/input';
import { Dialog, DialogContent, DialogTitle } from '@eduthemes/ui/components/dialog';
```

Edit components in `src/components` once for both apps. `src/workbench.jsx`
contains application compositions: field ID association, dismissible notices,
tooltips, layout grids, supporting `ContextHelp` disclosures, and a bridge for the
participant's imperative dialogs. Use ContextHelp for optional explanations;
keep consent, decisions, errors, and essential action instructions visible.
These compositions are distinct from the generated shadcn primitives.
The apps' `components.json` aliases point to this package; check CLI output paths
before adding components so a second local copy is not introduced.

Local adaptations preserve existing behavior and the professor's layout requests:

- Buttons default to `type="button"`, use 40px desktop/44px phone targets, and
  support an `auto` size for wrapping actions.
- Card supports a semantic `as` element and leaves page padding to its caller.
- Dialogs use a continuous neutral surface with compact titles/actions, Escape
  dismissal, contained focus, and opener focus restoration.
- Checkbox bridges existing `onChange` handlers to Radix `onCheckedChange` and
  discards the old native `type` prop so it cannot submit a surrounding form.
- Field context associates existing grouped labels and controls. Textareas honor
  their `rows`; native selects use one chevron and retain native keyboard behavior.
- Tab panels can remain mounted while inactive so switching tabs preserves drafts.
- LoadingSkeleton uses the shared Skeleton; pending actions keep their label,
  `aria-busy`, and existing content. Reduced-motion preferences disable animation.

Sources: [Vite installation](https://ui.shadcn.com/docs/installation/vite),
[JavaScript setup](https://ui.shadcn.com/docs/javascript),
[Dialog](https://ui.shadcn.com/docs/components/radix/dialog), and
[Native Select](https://ui.shadcn.com/docs/components/radix/native-select).
