# Incantly brand guide

Colors, type, logo and the shapes the product is built from. Every value here is
taken from the app itself, so the site and anything made from this guide match.

- **Source of truth:** the primitive block at the top of `src/app/globals.css`.
  If this file and the code disagree, the code wins; update this file.
- **In the product,** components never use these hex values directly. They use
  the semantic roles below (`bg-canvas`, `text-foreground`, …); see
  `docs/design-system.md`.

## Logo

| File | Size | Background | Use for |
| --- | --- | --- | --- |
| `incantly-logo.png` | 2028 × 704 | Transparent | The full logo on light backgrounds |
| `incantly-logo-on-white.png` | 2028 × 704 | White | Places that can't show transparency (some email clients, documents) |
| `incantly-mark.png` | 868 × 1152 | Transparent | The book mark alone: avatars, app icons, small spaces |
| `public/incantly-logo.svg` (in the app) | Vector | Transparent | The web, and anywhere it has to scale |

- **The mark** is an open book: a blue cover (`#2B62D9`) with two page lines
  (`#1C1C1B`).
- **The wordmark** is "incantly", always lowercase, set in the display serif
  (Georgia) in the text color (`#343636`), tracked tight (about −0.05em).
- **Spacing:** keep clear space around the logo of at least the height of the
  "i" dot. Don't place it on busy imagery or on the blue.
- **Don't** recolor, stretch, outline or add effects to it, and don't
  capitalize the wordmark.

## Colors

### Brand primitives

| Name | Hex | Role |
| --- | --- | --- |
| White | `#FFFFFF` | Page background, cards, text on blue |
| Soft | `#F4F4F3` | Quiet sections, inputs, sidebar |
| Border | `#BEC2C6` | Dividers, outlines, disabled states |
| Ink | `#8A8F8D` | The neutral that text and actions are mixed from |
| **Blue** | **`#2B62D9`** | Primary buttons, links, the logo's book, the closing band |
| Blue deep | `#2459C4` | Hover and pressed state of the blue |
| Pine | `#3E6B51` | Eyebrow accents, check marks, "Most popular" |
| Sage light | `#DEE6E1` | Feature card fill, pill badges |
| Sage | `#CCD8D1` | Feature card fill |
| Stone | `#E9E8E5` | Feature card fill |
| Shader blue | `#99CDFC` | The animated growth shader behind the closing band |

### Text and actions

These are mixed from Ink and black in the code; the hex values are the result.

| Role | Hex | Use | Contrast on white |
| --- | --- | --- | --- |
| Text | `#343636` | Headings and body copy | 12.2 : 1 |
| Muted text | `#636766` | Secondary copy, captions | 5.7 : 1 |
| Subtle text | `#8A8F8D` | Decorative marks and large text only, never body copy | 3.3 : 1 |
| Dark action | `#343636`, hover `#212222` | Dark buttons and focus rings | 12.2 : 1 |

White on Blue is 5.5 : 1 and Pine on white is 6.1 : 1, so both pass WCAG AA for
normal text. Body copy must stay at 4.5 : 1 or more.

### Status

| Name | Hex | Soft fill | Use |
| --- | --- | --- | --- |
| Red | `#B42318` | `#FEF3F2` | Errors, invalid fields, removed text in suggested edits |
| Green | `#1A6B34` | `#E7F5EC` | Added text in suggested edits |

## Typography

| Role | Typeface | Fallbacks |
| --- | --- | --- |
| Display (headings, wordmark, prices) | **Georgia** | "Times New Roman", serif |
| Body and interface | **Arial** | Helvetica, sans-serif |

Both are system fonts, so nothing has to load and text never shifts.

| Style | Font | Size | Line height | Tracking |
| --- | --- | --- | --- | --- |
| Hero heading | Georgia, regular | 48 → 84 px (scales with the screen) | 0.96 | −0.06em |
| Section heading | Georgia, regular | 32 → 60 px | 1.05 | −0.045em |
| Card / page heading | Georgia, regular | 24 → 32 px | 1.1 | −0.02em to −0.03em |
| Price | Georgia, regular | 40 → 56 px | 1 | −0.05em |
| Body | Arial | 16 → 18 px | 1.6 | normal |
| Small / captions | Arial | 13–14 px | 1.5 | normal |
| Eyebrow label | Arial, bold, UPPERCASE | 11 px | 1.4 | +0.12em |

- Headings are regular weight, never bold. The serif carries them.
- Text is sentence case. Only eyebrow labels are uppercase.

## Shape and layout

| Element | Value |
| --- | --- |
| Primary button | Blue fill, white text, 10 px radius, at least 44 px tall |
| Secondary button | White fill, Border outline, Text color, same size |
| Cards and panels | White on Soft, 1 px Border, 18 px radius |
| Pill badges | Fully rounded, 12 px text, Sage light fill with Pine text |
| Touch targets | At least 44 × 44 px |
| Page width | Content up to 1216 px (76rem), centred |
| Breakpoints | 640, 768, 1024, 1280 px (mobile first, from 320 px) |

## Motifs

- **✳** (eight-spoked asterisk) is the recurring brand mark in copy and
  illustration: the hero, the closing band, the "Most popular" badge. Draw it
  in Blue or Pine.
- **Hand-drawn notes:** illustrations are loose line drawings of notes,
  questions and connections (see `public/audience-*.svg`,
  `public/feature-*.svg`).
- **Wavy underline:** navigation links hover with a blue wavy underline.

## Voice, in short

Calm, curious and plain. Sentence case, short sentences, no hype. Examples
from the site: "A notebook for everything your ideas can become.", "Keep
following the thought."
