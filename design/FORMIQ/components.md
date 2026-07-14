# Components

## Shared Component Style

All components must share one visual language:

```css
background: rgba(255, 255, 255, 0.62);
backdrop-filter: blur(24px);
border: 1px solid rgba(255, 255, 255, 0.35);
box-shadow: none;
transition: transform 200ms ease-out, background 200ms ease-out, border-color 200ms ease-out;
```

No strong shadows.

## Buttons

- Border radius: `14px`
- Primary button: `#229ED9` background, white text
- Secondary button: glass background, primary text
- Destructive button: use `#EF4444` only when the destructive nature is explicit
- Hover: `translateY(-2px)`
- Transition: `200ms ease-out`

Buttons should use icons when the action is tool-like or spatial. Use text when clarity is more important than compactness.

## Panels And Cards

- Border radius: `20px`
- Use glass surfaces.
- Do not use heavy card stacks.
- Do not place cards inside cards unless the inner card is a repeated data item.
- Major panels should feel like overlays, not separate pages.

## Navigation

- Project home may use project-management navigation.
- GIS workspace navigation must stay subordinate to the map.
- Active navigation uses the primary color with restrained emphasis.

## Tables And Lists

- Use clean row separation with hairline borders.
- Metadata uses caption typography.
- Actions should be compact and consistent.
- Avoid dense enterprise-table styling that feels like Bootstrap.

## Inputs

- Inputs use glass or light neutral backgrounds.
- Search fields should be prominent but calm.
- Focus state uses a thin primary border or soft primary outline.

## Menus

- Menus are compact glass panels.
- Destructive actions appear at the end.
- Rename, duplicate, export, and delete actions should be discoverable but not visually noisy.

