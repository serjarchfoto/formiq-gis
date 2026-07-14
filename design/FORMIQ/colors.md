# Colors

## Core Palette

| Token | Value | Usage |
| --- | --- | --- |
| Primary | `#229ED9` | Main action, selected state, active map tool |
| Background | `#F8FAFC` | App base, non-map fallback background |
| Surface | `rgba(255,255,255,0.62)` | Glass panels and overlays |
| Border | `rgba(255,255,255,0.35)` | Glass panel borders |
| Text | `#0F172A` | Primary text |
| Secondary text | `#64748B` | Labels, metadata, quiet controls |
| Success | `#22C55E` | Successful operation, valid status |
| Warning | `#F59E0B` | Warning state, attention needed |
| Danger | `#EF4444` | Delete, destructive state, errors |

## Rules

- Use the smallest possible number of colors per screen.
- `#229ED9` is the only strong brand accent.
- Do not create new dominant palettes for individual modules.
- Avoid purple gradients, beige themes, Bootstrap blues, and Material Design color ramps.
- Color must clarify hierarchy or state. It is not decoration.

## Glass On Map

Use translucent white panels over maps by default:

```css
background: rgba(255, 255, 255, 0.62);
backdrop-filter: blur(24px);
border: 1px solid rgba(255, 255, 255, 0.35);
```

When a map is visually bright, increase contrast by adding a subtle white overlay behind controls rather than darkening the whole screen.

## State Colors

- Success: only for completed, valid, connected, or ready states.
- Warning: only for partial, pending, rate-limited, or attention states.
- Danger: only for destructive actions and errors.

