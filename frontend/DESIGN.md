# ACME Facilities design system

One look for the whole app, taken from the sign-in page: **ACME teal on white**, with a
matching **dark mode**. Light or dark follows the device, or the choice in the account menu.

## The one rule

**Never write a color value in a component.** Every color lives in
[`src/theme/tokens.js`](src/theme/tokens.js); components use the theme through MUI:

```jsx
<Typography sx={{ color: 'text.secondary' }}>…</Typography>
<Box sx={{ bgcolor: 'surface.subtle', borderColor: 'divider' }}>…</Box>
<Button variant="contained">Save</Button>              // primary = ACME teal
```

This is what makes dark mode work everywhere for free. `npm test` fails if a hex, `rgb()`
or `hsl()` value appears anywhere in `src/` outside `src/theme/`.

## Colors

| Token (use in `sx`) | Light | Dark | Use for |
| --- | --- | --- | --- |
| `primary.main` / `brand.main` | `#0e6f68` ACME teal | `#4fc2b8` | Main buttons, links, active navigation, logo |
| `secondary.main` | `#b8641a` amber | `#e39a55` | Things that need attention (sparingly) |
| `background.default` | `#f3f6f5` | `#111719` | Page background |
| `background.paper` | `#ffffff` | `#182023` | Cards, bars, menus, dialogs |
| `surface.subtle` | `#e9efed` | `#1f292c` | Table headers, quiet fills |
| `text.primary` | `#1b262c` | `#e4ebe9` | Body text, headings |
| `text.secondary` | `#55656c` | `#9aabaf` | Supporting text, hints, labels |
| `divider` | `#d8e0de` | `#2b373b` | Borders and rules |
| `brandSurface.main` | `#0a524d` | `#0b3f3b` | The sign-in brand panel (text on it: `brandSurface.contrastText`) |
| `error` / `warning` / `info` / `success` | red / amber / blue / green | lighter versions | Alerts and form errors (MUI uses them automatically) |

### Incident status and priority

Always show these with the shared chips, never custom styling:

```jsx
import { PriorityChip, StatusChip } from '../components/IncidentChips'

<StatusChip status={incident.status} />      // Open · In progress · Blocked · Resolved · Closed
<PriorityChip priority={incident.priority} /> // Low · Medium · High · Critical (solid red)
```

| Status | Color | | Priority | Color |
| --- | --- | --- | --- | --- |
| Open | blue | | Low | grey |
| In progress | teal | | Medium | blue |
| Blocked | red | | High | amber |
| Resolved | green | | Critical | solid red |
| Closed | grey | | | |

Labels for statuses, priorities and categories are in
[`src/constants/incidents.js`](src/constants/incidents.js). Every text/background pair
meets WCAG AA contrast (4.5:1) in both modes.

### Charts

Charts use `@mui/x-charts` with the colors from `useChartColors()` (tokens `chart.series`,
in fixed order: teal, then orange). Both modes pass the data-viz palette checks (lightness
band, chroma, colour-blind separation, contrast). One-series charts use slot 1 and no legend;
every chart has a "Show as table" option. Prefer a table or ranked list when it reads better.

## Type

**Inter** (bundled, no external font requests). Use MUI variants, not custom sizes:

| Variant | Size | Use |
| --- | --- | --- |
| `h1` | 32px bold | Rare: hero text on the brand panel |
| `h2` | 24px bold | Page titles (`<Typography variant="h2" component="h1">`) |
| `h3` | 20px | Section titles |
| `h4` | 17px | Card titles |
| `body1` / `body2` | 16px / 14px | Text / secondary text, table cells |
| `overline` | 12px caps | Small labels above groups |

Numbers use tabular figures so columns of counts line up.

## Layout and surfaces

- Spacing is on an 8px grid: `p: 2` = 16px, `spacing={3}` = 24px. Lay out with `Stack`
  and `gap`, not margins.
- Radius 8px everywhere (dialogs 12px). **Flat surfaces**: a 1px `divider` border, no
  shadows (`Card` is outlined and `Paper` has no elevation by default).
- Signed-in pages sit inside `AppLayout` (top bar, content up to 1200px wide). Start a
  page with an `h2` title in a `Stack spacing={3}`.
- Screen sizes come from React Responsive via `useBreakpoints()`: phone < 600px,
  tablet 600–899px, desktop ≥ 900px. Every page must work at 390px wide.

## Components

| Need | Use |
| --- | --- |
| Main action | `<Button variant="contained">` (one per view) |
| Other actions | `<Button variant="outlined">` or `variant="text"` |
| Form fields | `<TextField>` (full width by default), `<PasswordField>` for passwords |
| Errors and notices | `<Alert severity="…">`; field errors in the field's `helperText` |
| Incident status / priority | `<StatusChip>`, `<PriorityChip>` |
| Lists of records | MUI `Table` on desktop, cards on phones |
| Empty or not-built states | A `Paper variant="outlined"` with a dashed border and one sentence |

## Writing

Plain words from the user's side: "Report an incident", not "Create incident entity".
Buttons say what happens ("Create account", "Sign in"). Errors say what went wrong and
how to fix it.
