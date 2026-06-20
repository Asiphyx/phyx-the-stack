---
name: Technomancy HUD
colors:
  surface: '#131313'
  surface-dim: '#131313'
  surface-bright: '#3a3939'
  surface-container-lowest: '#0e0e0e'
  surface-container-low: '#1c1b1b'
  surface-container: '#201f1f'
  surface-container-high: '#2a2a2a'
  surface-container-highest: '#353534'
  on-surface: '#e5e2e1'
  on-surface-variant: '#baccb0'
  inverse-surface: '#e5e2e1'
  inverse-on-surface: '#313030'
  outline: '#85967c'
  outline-variant: '#3c4b35'
  surface-tint: '#2ae500'
  primary: '#efffe3'
  on-primary: '#053900'
  primary-container: '#39ff14'
  on-primary-container: '#107100'
  inverse-primary: '#106e00'
  secondary: '#ffabf3'
  on-secondary: '#5b005b'
  secondary-container: '#fe00fe'
  on-secondary-container: '#500050'
  tertiary: '#ecfdff'
  on-tertiary: '#00363a'
  tertiary-container: '#55f2ff'
  on-tertiary-container: '#006c73'
  error: '#ffb4ab'
  on-error: '#690005'
  error-container: '#93000a'
  on-error-container: '#ffdad6'
  primary-fixed: '#79ff5b'
  primary-fixed-dim: '#2ae500'
  on-primary-fixed: '#022100'
  on-primary-fixed-variant: '#095300'
  secondary-fixed: '#ffd7f5'
  secondary-fixed-dim: '#ffabf3'
  on-secondary-fixed: '#380038'
  on-secondary-fixed-variant: '#810081'
  tertiary-fixed: '#7df4ff'
  tertiary-fixed-dim: '#00dbe9'
  on-tertiary-fixed: '#002022'
  on-tertiary-fixed-variant: '#004f54'
  background: '#131313'
  on-background: '#e5e2e1'
  surface-variant: '#353534'
  void-black: '#050505'
  toxic-green: '#39FF14'
  ethereal-magenta: '#FF00FF'
  data-blue: '#00F0FF'
  arcane-purple: '#8E1E55'
  warning-amber: '#BC7F2C'
typography:
  headline-xl:
    fontFamily: anybody
    fontSize: 48px
    fontWeight: '900'
    lineHeight: '1.1'
    letterSpacing: -0.05em
  headline-lg:
    fontFamily: anybody
    fontSize: 32px
    fontWeight: '800'
    lineHeight: '1.2'
  headline-lg-mobile:
    fontFamily: anybody
    fontSize: 24px
    fontWeight: '800'
    lineHeight: '1.2'
  body-md:
    fontFamily: JetBrains Mono
    fontSize: 16px
    fontWeight: '400'
    lineHeight: '1.6'
  label-sm:
    fontFamily: JetBrains Mono
    fontSize: 12px
    fontWeight: '500'
    lineHeight: '1.4'
    letterSpacing: 0.1em
  code-snippet:
    fontFamily: JetBrains Mono
    fontSize: 14px
    fontWeight: '400'
    lineHeight: '1.5'
spacing:
  pixel-unit: 4px
  gutter: 24px
  margin-sm: 16px
  margin-md: 32px
  margin-lg: 64px
---

## Brand & Style

This design system embodies the "Pixel Cyberpunk Wizard" aesthetic—a fusion of arcane mysticism and high-tech terminal interfaces. The UI is envisioned as a "Technomancy HUD," evoking the feeling of a digital spellbook or a rogue AI’s workstation. It targets a developer-centric, creative audience that appreciates 90s-era hardware nostalgia mixed with futuristic neon intensity.

The visual style is a blend of **Retro-Futurism** and **Brutalism**. It prioritizes high-contrast readability, sharp 90-degree angles, and pixel-perfect precision. The atmosphere is immersive and slightly chaotic, characterized by scanline textures, dithered gradients, and intense "outer glow" effects that simulate a CRT monitor struggling to contain the magical data within.

## Colors

The palette is anchored in **Void Black (#050505)**, providing a deep, non-reflective base that allows neon elements to pop with maximum luminance.

- **Primary (Toxic Green):** Used for system success states, primary actions, and "active" magical energy.
- **Secondary (Ethereal Magenta):** Used for headlines, brand moments, and critical "spell" triggers.
- **Tertiary (Data Blue):** Used for informational accents, terminal prompts, and secondary HUD elements.
- **Accents:** Arcane Purple and Warning Amber are reserved for low-frequency interactions, such as dangerous "cursed" actions or system alerts.

All chromatic colors should be applied with an "outer glow" (box-shadow or drop-shadow) to simulate the blooming light of a gas-discharge display.

## Typography

Typography is the core of the "HUD" feel. We utilize a dual-font strategy to balance character and readability.

- **Headlines:** Use **Anybody** (or a similar high-impact, variable font) set to maximum weight. This font acts as the "Display" face, often styled with text-shadow glows or dithered color overlays.
- **System/Body:** Use **JetBrains Mono**. This provides the "clean code vibe" essential for the technomancy aesthetic. It ensures that technical data remains legible even amidst heavy visual effects.
- **Styling:** Headlines should be all-caps. Labels and metadata should use increased letter spacing to mimic serial numbers on hardware components.

## Layout & Spacing

The layout follows a **Fixed Grid** philosophy, reminiscent of old-school adventure game interfaces or terminal windows. 

- **The Grid:** A strict 12-column system for desktop, collapsing to 4 columns for mobile. 
- **The Frame:** All content is contained within a persistent 1px or 2px border "Frame" that defines the edge of the HUD. 
- **Spacing:** All spacing increments must be multiples of **4px** to maintain pixel alignment. 
- **Responsive Behavior:** On mobile, the "HUD" elements stack vertically, and decorative sidebar "widgets" are hidden to prioritize the central terminal feed.

## Elevation & Depth

In this design system, depth is not created through realistic shadows, but through **Tonal Layering** and **Luminance**.

1.  **Level 0 (The Void):** The background (#050505).
2.  **Level 1 (The Surface):** A slightly lighter black (#0A0A0F) with a subtle scanline overlay (1px horizontal stripes at 5% opacity).
3.  **Level 2 (The Interface):** Elements with 1px solid neon borders.
4.  **Level 3 (The Bloom):** Elements that "emit light" using heavy box-shadows (e.g., `box-shadow: 0 0 15px #39FF14`).

Use **Dithering** (checkered pixel patterns) instead of smooth gradients to transition between dark surfaces and light sources, reinforcing the 8-bit/16-bit sprite charm.

## Shapes

The shape language is strictly **Sharp**. There are no rounded corners in this design system. Every box, button, and container must have a 0px border-radius to preserve the pixel-grid integrity. 

- **Notched Corners:** For specialized components (like primary action buttons), use a 45-degree "clipped corner" effect rather than rounding to suggest advanced military/industrial hardware.
- **Borders:** Use consistent 1px or 2px strokes. Never use soft anti-aliased borders.

## Components

- **Buttons:** Rectangular with a 1px neon border. On hover, the button fills with the border color, and the text switches to Void Black. Add a "flicker" animation on hover to simulate a terminal glitch.
- **Input Fields:** Styled as terminal prompts. Use a blinking underscore (`_`) or block cursor. The border glows when the field is focused.
- **Cards:** Use a semi-transparent background (50% opacity) with a 1px border. Include a small "ID tag" or "Serial Number" in the top-right corner in `label-sm` typography.
- **Chips/Status Tags:** Small rectangular blocks of solid color with black text. No padding on the sides; let the color block define the shape.
- **Icons:** Must be **Sprite-based** or custom-drawn 16x16 pixel art. Icons should never be smooth SVGs; they must show visible pixel stepping.
- **Scanlines:** A global overlay component that sits above the UI at low opacity (3-5%) to give the entire interface a physical CRT texture.
- **Progress Bars:** Segmented into discrete blocks (e.g., 10 blocks for 100%) rather than a smooth continuous fill.