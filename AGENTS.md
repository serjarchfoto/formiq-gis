# FORMIQ Agent Instructions

## Design Source Priority

Use design sources in this order:

1. `design/FORMIQ`
2. `design/open-design`
3. Existing project code

Before creating or changing any interface, first study:

1. `design/FORMIQ/DESIGN.md`
2. The relevant files inside `design/FORMIQ/`
3. Relevant references inside `design/open-design/`
4. The existing implementation

`design/FORMIQ` is the main source of truth for project design rules.

`design/open-design` is a secondary source of design references. Never copy interfaces literally. Use only best practices in composition, typography, components, interaction design, and UX.

## FORMIQ Design Role

Act as the lead designer for FORMIQ.

Do not invent a new style. Use only the established FORMIQ design language. Any new screen must look as if it was designed by the same team.

## Required Typography

Interface font:

- Inter Variable

Weights:

- Regular 400
- Medium 500
- SemiBold 600
- Bold 700
- Black 900

Logo:

- General Sans Bold

Sizes:

- H1: 40px
- H2: 32px
- H3: 24px
- Body: 16px
- Captions: 13px
- Large background words: Inter Black, 280-420px, opacity `0.04`

## Design Principles

- The map is the main interface element.
- The interface is built over the map.
- Do not use heavy cards.
- Use glass panels.
- Use `backdrop-filter: blur(24px)`.
- Use thin borders.
- Use minimal shadows.
- Use generous spacing.
- Use large typography.
- Use diagonal compositions where they improve hierarchy.
- Use translucent surfaces.
- Orient toward Linear, ArcGIS Pro, Figma, Dropship.io, and Mebelun.
- Do not use Bootstrap-style UI.
- Do not use Material Design.

## FORMIQ Palette

- Primary: `#229ED9`
- Background: `#F8FAFC`
- Surface: `rgba(255,255,255,0.62)`
- Border: `rgba(255,255,255,0.35)`
- Text: `#0F172A`
- Secondary text: `#64748B`
- Success: `#22C55E`
- Warning: `#F59E0B`
- Danger: `#EF4444`

## Component Rules

All components must use one consistent style.

Buttons:

- `border-radius: 14px`

Cards and major panels:

- `border-radius: 20px`

Glass:

```css
background: rgba(255,255,255,.62);
backdrop-filter: blur(24px);
border: 1px solid rgba(255,255,255,.35);
```

No strong shadows.

Hover:

```css
transform: translateY(-2px);
transition: 200ms ease-out;
```

## Priorities

1. Simplicity
2. Architectural aesthetics
3. GIS-first
4. Air
5. Glass panels
6. Large typography
7. Map as the main element
8. Minimal colors
9. Professional appearance at the level of Linear, ArcGIS Pro, and Figma

