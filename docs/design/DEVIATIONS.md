# Setup vs `venn-landing-reference.html`

Screenshots: `setup-1440x900.png`, `setup-390x844.png` (also in `docs/screens/`).

## Matches
- White page, `#F4F5F7` surfaces, Bricolage Grotesque, sentence case
- Underlined sentence fields, grey chips, “Add another”, “+ Fine-tune the search”
- Ink pill CTA, 2px underlined links, About / Source code nav
- Two-column desktop hero with live sample graph (saved London Qloo snapshot)
- Legend (You / Partners / Shared taste) + “Saved Qloo results, 15 Oct 2026”
- “What you get” band with three panels + trust trio + footer copy

## Deviations
1. **Sample partners** — Reference mock showed “Quiet Hours Yoga” etc. App uses the **real** top-6 from the saved London snapshot (VIU Eyewear, Rains, …) as required.
1b. **Sample viz** — Landing preview is a **ranked match list** (scores + bars), not overlapping Venn circles. Results Graph canvas is unchanged.
2. **Fine-tune** — Opens an inline panel (same behaviour as before); reference is a static link only.
3. **What you get images** — Prefer Playwright WebPs under `public/shots/`; SVG illustrations remain as fallback if WebP missing.
4. **Mobile** — Graph stacks under the form (reference mobile crop often hides it).
5. **Provider badge** — Omitted from the landing header to match the reference (still shown on Results).
