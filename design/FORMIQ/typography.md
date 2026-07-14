# Typography

## Fonts

Interface font:

- Inter Variable

Logo font:

- General Sans Bold

## Weights

- Regular: 400
- Medium: 500
- SemiBold: 600
- Bold: 700
- Black: 900

## Scale

| Style | Size | Weight | Usage |
| --- | --- | --- | --- |
| H1 | 40px | 700 | Main screen title |
| H2 | 32px | 600 | Section title, major panel title |
| H3 | 24px | 600 | Panel group title |
| Body | 16px | 400 or 500 | Main interface text |
| Caption | 13px | 400 or 500 | Metadata, helper labels, compact controls |
| Background word | 280-420px | 900 | Large atmospheric type with `opacity: 0.04` |

## Rules

- Use large typography to create architectural confidence.
- Keep letter spacing at `0`.
- Do not scale text with viewport width.
- Use `Medium 500` for controls and table labels.
- Use `SemiBold 600` for panel headings and strong actions.
- Use `Bold 700` for screen-level headings.
- Use `Black 900` only for background words and rare brand moments.

## Background Words

Large background words may be used for atmosphere when they do not reduce usability:

```css
font-family: "Inter Variable", sans-serif;
font-weight: 900;
font-size: 280px;
opacity: 0.04;
```

They must never compete with the map, controls, or data.

