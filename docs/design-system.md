# UI design system

## Color source of truth

The only editable palette lives at the top of `src/app/globals.css`:

| Primitive | Value | Intended character |
| --- | --- | --- |
| `--palette-white` | `#FFFFFF` | Clean canvas and raised surfaces |
| `--palette-soft` | `#F4F4F3` | Quiet sections and controls |
| `--palette-border` | `#BEC2C6` | Dividers, outlines, and disabled states |
| `--palette-ink` | `#8A8F8D` | Source tone for text and interaction colors |

Edit those four variables to retheme the application. Do not change colors in
individual pages or components.

## Mandatory usage rules

1. Components use semantic roles, never palette primitives or literal colors.
2. JSX uses the Tailwind aliases below. CSS Modules use the corresponding
   `--ui-*` custom properties.
3. Do not add raw hex, RGB, HSL, `black`, or `white` values outside the palette
   and semantic-token blocks in `src/app/globals.css`.
4. Use `foreground` for normal text. `subtle` is only for decorative marks,
   disabled labels, placeholders, or large text that passes contrast checks.
5. Interactive controls use `action`, `action-hover`, and `focus`. Never remove
   the global visible focus treatment without providing an equivalent.
6. Borders use `default`; use `strong` only when hierarchy or state must be
   clearer.
7. New semantic needs must be added once in `:root` and exposed through
   `@theme inline`. Do not solve them with one-off colors.
8. Check text and control contrast before shipping UI. Normal text must meet
   WCAG AA contrast of at least 4.5:1.

## Semantic roles

| Tailwind utility examples | CSS token | Use |
| --- | --- | --- |
| `bg-canvas` | `--ui-canvas` | Page background |
| `bg-surface` | `--ui-surface` | Quiet sections and inputs |
| `bg-raised` | `--ui-surface-raised` | Cards and overlays |
| `text-foreground` | `--ui-text` | Headings and body copy |
| `text-muted` | `--ui-text-muted` | Secondary copy |
| `text-subtle` | `--ui-text-subtle` | Non-essential or large text only |
| `text-inverse` | `--ui-text-inverse` | Text on dark action surfaces |
| `border-default` | `--ui-border` | Standard borders and dividers |
| `border-strong` | `--ui-border-strong` | Emphasized borders |
| `bg-action` | `--ui-action` | Primary actions |
| `hover:bg-action-hover` | `--ui-action-hover` | Primary-action hover state |
| `outline-focus` | `--ui-focus` | Keyboard focus state |
| `bg-disabled` | `--ui-disabled` | Disabled controls |

## Example

```tsx
<button className="bg-action text-inverse hover:bg-action-hover focus-visible:outline-focus">
  Continue
</button>
```

```css
.card {
  background: var(--ui-surface-raised);
  border: 1px solid var(--ui-border);
  color: var(--ui-text);
}
```

## Responsive system

Responsive behavior is part of every component's initial design. Implement the
smallest layout first, then add only the changes needed as space increases.

### Viewport tiers

The named Tailwind breakpoints are defined in `src/app/globals.css` so the whole
application shares one responsive scale:

| Prefix | Starts at | Intended use |
| --- | ---: | --- |
| Base | `0px` | Phones and the default implementation |
| `sm:` | `640px` | Large phones and compact layouts |
| `md:` | `768px` | Tablets and two-column opportunities |
| `lg:` | `1024px` | Desktop navigation and wider composition |
| `xl:` | `1280px` | Large-screen spacing and content limits |

Breakpoints describe available space, not a specific device. Do not add a new
breakpoint inside a component unless the shared scale cannot express a genuine
layout transition.

### Mandatory implementation rules

1. Start with the 320px layout. Unprefixed Tailwind utilities are the mobile
   rules; breakpoint-prefixed utilities progressively enhance them.
2. Prefer `w-full`, `max-w-*`, grid, flexbox, `minmax()`, and `clamp()` over
   fixed pixel widths. Use JavaScript viewport checks only when CSS cannot
   express the behavior.
3. Do not hide essential content on small screens. Reflow, stack, wrap, or move
   it behind an accessible disclosure control.
4. Keep page-level horizontal scrolling at zero. Scrollable data regions such
   as tables must contain their own overflow and remain keyboard accessible.
5. Interactive targets must be at least 44px by 44px. Do not rely on hover for
   information or actions.
6. Text containers must survive short, average, and very long content. Apply
   `min-w-0`, wrapping, truncation, or line clamping deliberately.
7. Images require explicit dimensions, an appropriate responsive `sizes`
   value, and lazy loading when below the fold.
8. Fixed and full-bleed UI must account for `env(safe-area-inset-*)`.
9. Layouts must remain usable at 200% browser zoom and with increased text size.
10. Motion must respect `prefers-reduced-motion`.

### Required verification

Before considering a UI task complete, check at least:

- `320 × 568` — minimum supported phone width
- `375 × 812` — common phone layout
- `768 × 1024` — tablet layout
- `1024 × 768` — compact desktop or landscape tablet
- `1440 × 900` — large desktop layout

At every size, verify navigation, reading order, content wrapping, touch target
size, focus visibility, image behavior, overflow, and fixed/sticky elements.
