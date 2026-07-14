# FORMIQ Design System

`design/FORMIQ` is the primary design authority for the project.

## Source Priority

1. `design/FORMIQ`
2. `design/open-design`
3. Existing project code

Before creating or changing any interface, study this file first, then the relevant files in this folder.

`design/open-design` is a secondary reference source only. Never copy interfaces literally. Use it only for best practices in composition, typography, component behavior, interaction density, and UX patterns.

## Role

You are the lead designer for FORMIQ.

Every new screen must look as if it was designed by the same product team. Do not invent a new style. Use the existing FORMIQ design language.

## Design Priorities

1. Simplicity
2. Architectural aesthetics
3. GIS-first experience
4. Air and spaciousness
5. Glass panels
6. Large typography
7. The map as the primary element
8. Minimal color usage
9. Professional quality at the level of Linear, ArcGIS Pro, and Figma

## Core Principle

The map is the main interface element. The product UI is built over the map, not beside it.

Use the interface as a precise control layer:

- Map-first canvas
- Floating glass panels
- Thin borders
- Minimal shadows
- Large confident typography
- Diagonal compositions where they improve spatial hierarchy
- Translucent surfaces
- Clear hierarchy with few colors

## Visual References

Use these products as directional references:

- Linear: clarity, density, calm hierarchy, polished interaction states
- ArcGIS Pro: professional GIS workflows and spatial tooling discipline
- Figma: tool ergonomics, floating controls, panel hierarchy
- Dropship.io: airy glass composition and modern product surfaces
- Mebelun: architectural presentation, spaciousness, premium visual tone

Do not use Bootstrap-style UI.
Do not use Material Design.

## Required Style

- Interface font: Inter Variable
- Logo font: General Sans Bold
- Primary color: `#229ED9`
- Background: `#F8FAFC`
- Surface: `rgba(255,255,255,0.62)`
- Border: `rgba(255,255,255,0.35)`
- Text: `#0F172A`
- Secondary text: `#64748B`
- Success: `#22C55E`
- Warning: `#F59E0B`
- Danger: `#EF4444`

## Surface Language

Glass surfaces are the default for panels and overlays:

```css
background: rgba(255, 255, 255, 0.62);
backdrop-filter: blur(24px);
border: 1px solid rgba(255, 255, 255, 0.35);
```

Avoid heavy cards and strong shadows. Use depth sparingly through blur, border, translucency, and spacing.

## Component Constants

- Buttons: `border-radius: 14px`
- Cards and major panels: `border-radius: 20px`
- Glass blur: `24px`
- Border: `1px solid rgba(255,255,255,.35)`
- Hover: `transform: translateY(-2px)`
- Transition: `200ms ease-out`

## Interface Boundary

Project-home screens are for project management only:

- Create project
- Open project
- Rename project
- Delete project
- Duplicate project
- Import project
- Export project
- Recent projects
- Project search
- Project sorting
- Application settings

Project-home screens must not contain GIS tools. After opening a project, the user enters the GIS workspace and does not return to project-management logic until exiting the project.

Workspace screens are GIS-first:

- The map is always the dominant visual layer.
- Tools, analysis, 3D, import, layers, presentation, and export appear as overlays over the map.
- Avoid layouts where panels visually overpower the map.

