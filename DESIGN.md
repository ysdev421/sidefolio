# DESIGN.md

## Design Direction
- Product tone: calm, trustworthy, and operationally focused.
- Visual style: soft glass surfaces over a light mesh background.
- Mood keywords: practical, warm, clear, and premium-lite.

## Color System
- Primary: Teal (`#0d9488`, `#0f766e`)
- Supporting cool: Cyan/Sky for activity and links
- Supporting warm: Amber for summaries and attention
- Neutral text: Deep green-slate (`#0f1f1b`) and muted slate (`#4b635d`)
- Error: Rose
- Rule: avoid purple-first styling as a default brand direction.

## Typography
- Base family: `Manrope`, fallback `Noto Sans JP`
- Weight usage:
  - 800 for key totals and page titles
  - 700 for section headings
  - 500-600 for body and labels
- Tight tracking only for small overline labels.

## Surfaces & Components
- Core surfaces use translucent white panels with subtle blur.
- Panels have rounded corners and medium-depth shadows.
- Inputs use soft borders and teal focus ring.
- Primary buttons use teal gradient and elevated shadow.

## Motion
- Keep motion minimal and meaningful.
- Use short fade/slide reveals on page sections.
- Avoid decorative continuous animations.

## Layout Rules
- Mobile-first, single-column reading flow for forms.
- Desktop width cap around `max-w-5xl` for readability.
- Priority hierarchy:
  1. Current-year totals
  2. Action entry points
  3. Detailed breakdowns

## Accessibility
- Ensure text contrast remains readable over glass backgrounds.
- Preserve visible focus states for keyboard users.
- Keep clickable targets large enough for mobile use.
