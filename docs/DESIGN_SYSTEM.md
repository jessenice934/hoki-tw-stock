# KOVA Design System
## Based on DataPulse SaaS Analytics Dashboard

---

## Typography

### Font Families
| Role | Font | Fallback |
|------|------|----------|
| **Body / UI** | `DM Sans` | `sans-serif` |
| **Headings (h1-h6)** | `Space Grotesk` | `sans-serif` |
| **Monospace (prices/data)** | `ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas` | `monospace` |

### Font Loading
```html
<link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;700&family=Space+Grotesk:wght@400;500;600;700&display=swap" rel="stylesheet">
```

### Type Scale
| Token | Size | Line Height | Usage |
|-------|------|-------------|-------|
| `text-xs` | 0.75rem (12px) | 1rem | Captions, labels, timestamps |
| `text-sm` | 0.875rem (14px) | 1.25rem | Secondary text, descriptions |
| `text-base` | 1rem (16px) | 1.5rem | Body text |
| `text-lg` | 1.125rem (18px) | 1.75rem | Large body, card titles |
| `text-xl` | 1.25rem (20px) | 1.75rem | Section subtitles |
| `text-2xl` | 1.5rem (24px) | 2rem | Card headings |
| `text-3xl` | 1.875rem (30px) | 2.25rem | Section headings |
| `text-4xl` | 2.25rem (36px) | 2.5rem | Page headings |
| `text-5xl` | 3rem (48px) | 1 | Hero subheading |
| `text-6xl` | 3.75rem (60px) | 1 | Hero heading (md) |
| `text-7xl` | 4.5rem (72px) | 1 | Hero heading (lg) |

### Font Weights
| Weight | Value | Usage |
|--------|-------|-------|
| Regular | 400 | Body text, descriptions |
| Medium | 500 | Buttons, nav links, labels |
| Semibold | 600 | Card titles, emphasis |
| Bold | 700 | Headings, hero text, prices |

---

## Color Palette

### Primary
| Token | Value | Usage |
|-------|-------|-------|
| `primary` | `#2563EB` | Primary actions, links, active states |
| `primary-light` | `#3B82F6` | Gradient end, hover states |
| `primary-10` | `#2563eb1a` | Subtle backgrounds |
| `primary-20` | `#2563eb33` | Badges, soft fills |
| `primary-30` | `#2563eb4d` | Active indicators |
| `primary-50` | `#2563eb80` | Mid-opacity overlays |

### Light Mode (Default)
| Token | Value | RGB | Usage |
|-------|-------|-----|-------|
| `bg` | `#FFFFFF` | `rgb(255, 255, 255)` | Page background |
| `bg-subtle` | `#F8FAFC` | `rgb(248, 250, 252)` | Section alternate bg |
| `bg-card` | `#fffffffc` | `rgba(255,255,255,0.98)` | Card backgrounds |
| `border` | `#E5E7EB` | `rgb(229, 231, 235)` | Card/element borders |
| `border-hover` | `#D1D5DB` | `rgb(209, 213, 219)` | Border hover state |

### Light Mode Text
| Token | Value | RGB | Usage |
|-------|-------|-----|-------|
| `text-primary` | `#0F172A` | `rgb(15, 23, 42)` | Headings, primary text |
| `text-secondary` | `#475569` | `rgb(71, 85, 105)` | Body text, descriptions |
| `text-muted` | `#94A3B8` | `rgb(148, 163, 184)` | Captions, timestamps |
| `text-on-primary` | `#FFFFFF` | `rgb(255, 255, 255)` | Text on blue buttons |

### Dark Mode (Alternate)
| Token | Value | RGB | Usage |
|-------|-------|-----|-------|
| `dark-bg` | `#0B0B10` | `rgb(11, 11, 16)` | Page background |
| `dark-card` | `#121218` | `rgb(18, 18, 24)` | Card backgrounds |
| `dark-border` | `#1E293B` | `rgb(30, 41, 59)` | Borders |
| `dark-text` | `#F8FAFC` | `rgb(248, 250, 252)` | Primary text |
| `dark-muted` | `#94A3B8` | `rgb(148, 163, 184)` | Secondary text |

### Semantic Colors
| Token | Value | Usage |
|-------|-------|-------|
| `success` | `#22c55e` | Positive changes, gains |
| `success-dark` | `#059669` | Success on dark |
| `danger` | `#ef4444` | Negative changes, losses, errors |
| `warning` | `#f59e0b` | Warnings, caution |
| `info` | `#06b6d4` | Informational |
| `orange` | `#F97316` | Accent, gradient end |

### Accent Colors
| Token | Value | Usage |
|-------|-------|-------|
| `violet` | `#a855f7` | Secondary accent |
| `indigo` | `#6366f1` | Tertiary accent |
| `teal` | `#14b8a6` | Charts, data viz |

### Surface Colors (White overlays for dark mode)
| Token | Value | Usage |
|-------|-------|-------|
| `white-5` | `#ffffff0d` | Card bg (dark) |
| `white-10` | `#ffffff1a` | Borders, subtle fills |
| `white-20` | `#ffffff33` | Hover borders |
| `white-30` | `#ffffff4d` | Active states |
| `white-50` | `#ffffff80` | Mid emphasis |

---

## Gradients

### Primary Gradient (Buttons)
```css
background-image: linear-gradient(to right, #2563EB, #3B82F6);
```

### Gradient Text (Hero)
```css
background-image: linear-gradient(to right, #2563EB, #3B82F6, #F97316);
-webkit-background-clip: text;
color: transparent;
```

### Aurora Background (Page atmosphere)
```css
background: radial-gradient(ellipse 80% 80% at 50% -20%, rgba(37,99,235,0.3), transparent),
            radial-gradient(ellipse 50% 50% at 80% 50%, rgba(249,115,22,0.15), transparent),
            radial-gradient(ellipse 50% 50% at 20% 80%, rgba(59,130,246,0.2), transparent);
```

---

## Spacing

| Token | Value | Usage |
|-------|-------|-------|
| `space-1` | 0.25rem (4px) | Tight gaps |
| `space-2` | 0.5rem (8px) | Icon gaps, small padding |
| `space-3` | 0.75rem (12px) | Button padding-y, list gaps |
| `space-4` | 1rem (16px) | Card inner padding, gaps |
| `space-5` | 1.25rem (20px) | Medium spacing |
| `space-6` | 1.5rem (24px) | Section inner padding |
| `space-8` | 2rem (32px) | Section gaps |
| `space-12` | 3rem (48px) | Large section padding |
| `space-16` | 4rem (64px) | Section vertical padding |
| `space-20` | 5rem (80px) | Hero top padding |

---

## Border Radius

| Token | Value | Usage |
|-------|-------|-------|
| `rounded-sm` | 0.125rem (2px) | Subtle rounding |
| `rounded` | 0.25rem (4px) | Badges, tags |
| `rounded-md` | 0.375rem (6px) | Small buttons |
| `rounded-lg` | 0.5rem (8px) | Inputs, small cards |
| `rounded-xl` | 0.75rem (12px) | Buttons (btn-primary) |
| `rounded-2xl` | 1rem (16px) | Cards (glass-card) |
| `rounded-3xl` | 1.5rem (24px) | Large cards |
| `rounded-[32px]` | 32px | Pill shapes |
| `rounded-full` | 9999px | Avatars, badges, pills |

---

## Shadows

| Token | Value | Usage |
|-------|-------|-------|
| `shadow-sm` | `0 1px 2px 0 rgb(0 0 0 / .05)` | Cards (default) |
| `shadow-lg` | `0 10px 15px -3px rgb(0 0 0 / .1), 0 4px 6px -4px rgb(0 0 0 / .1)` | Hover cards |
| `shadow-xl` | `0 20px 25px -5px rgb(0 0 0 / .1), 0 8px 10px -6px rgb(0 0 0 / .1)` | Elevated elements |
| `shadow-primary` | `0 10px 15px -3px rgb(37 99 235 / .3)` | Primary button hover |
| `shadow-none` | `0 0 #0000` | Dark mode cards (no shadow) |

---

## Components

### Glass Card
```css
/* Light mode */
.glass-card {
  border-radius: 1rem;
  border: 1px solid #e5e7eb;
  background-color: rgba(255, 255, 255, 0.98);
  box-shadow: 0 1px 2px 0 rgb(0 0 0 / .05);
  backdrop-filter: blur(24px);
}

/* Dark mode */
.glass-card (dark) {
  border-color: rgba(255, 255, 255, 0.1);
  background-color: rgba(255, 255, 255, 0.05);
  box-shadow: none;
}
```

### Glass Card Hover
```css
/* Extends glass-card + */
.glass-card-hover {
  cursor: pointer;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

/* Hover light */
.glass-card-hover:hover {
  border-color: #d1d5db;
  background-color: #ffffff;
  box-shadow: 0 20px 25px -5px rgb(37 99 235 / .1);
}

/* Hover dark */
.glass-card-hover:hover (dark) {
  border-color: rgba(255, 255, 255, 0.2);
  background-color: rgba(255, 255, 255, 0.1);
}
```

### Primary Button
```css
.btn-primary {
  border-radius: 0.75rem;
  background-image: linear-gradient(to right, #2563EB, #3B82F6);
  padding: 0.75rem 1.5rem;
  font-weight: 500;
  color: #ffffff;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
}

.btn-primary:hover {
  transform: translateY(-2px);
  box-shadow: 0 10px 15px -3px rgb(37 99 235 / .3);
}

.btn-primary:active {
  transform: translateY(0);
}
```

### Secondary Button
```css
/* Light */
.btn-secondary {
  border-radius: 1rem;
  border: 1px solid #e5e7eb;
  background-color: #ffffff;
  padding: 0.75rem 1.5rem;
  font-weight: 500;
  color: #0f172a;
  transition: all 0.2s;
}

.btn-secondary:hover {
  border-color: #d1d5db;
  background-color: #f9fafb;
}

/* Dark */
.btn-secondary (dark) {
  border-color: rgba(255, 255, 255, 0.1);
  background-color: rgba(255, 255, 255, 0.05);
  color: #F8FAFC;
}

.btn-secondary:hover (dark) {
  border-color: rgba(255, 255, 255, 0.2);
  background-color: rgba(255, 255, 255, 0.1);
}
```

---

## Layout

### Container
- Max width: responsive, typically `max-w-7xl` (80rem / 1280px)
- Horizontal padding: `px-4` (mobile), `px-6` (sm), `px-8` (md+)

### Grid System
- 1 column (mobile)
- 2 columns (md: 768px)
- 3 columns (md/lg for features, pricing)
- 4 columns (md for metric cards)
- Gap: `gap-4` to `gap-8`

### Breakpoints
| Name | Min Width |
|------|-----------|
| `sm` | 640px |
| `md` | 768px |
| `lg` | 1024px |
| `xl` | 1280px |

---

## Animations & Transitions

### Default Transition
```css
transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
```

### Button Hover
```css
transform: translateY(-2px); /* lift effect */
box-shadow: 0 10px 15px -3px rgb(37 99 235 / .3);
```

### Card Hover
```css
transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
/* Border brightens, shadow appears */
```

### Easing
- Standard: `cubic-bezier(0.4, 0, 0.2, 1)` — smooth deceleration
- Duration: 200ms (buttons), 300ms (cards/panels)

---

## Key Design Decisions

1. **Dual fonts**: Space Grotesk for headings (geometric, modern), DM Sans for body (clean, readable)
2. **Blue + Orange gradient**: Primary gradient text uses blue-to-orange (`#2563EB` → `#3B82F6` → `#F97316`), creating energy
3. **Light mode default**: White page bg (`#FFFFFF`), clean and professional
4. **Aurora background**: Multi-point radial gradients with blue and orange — subtle on light bg
5. **Glass cards**: Nearly-white bg (`rgba(255,255,255,0.98)`) + subtle border `#E5E7EB` + `shadow-sm`; hover elevates to `shadow-xl` with blue tint
6. **Lift-on-hover buttons**: translateY(-2px) with blue shadow glow `rgb(37 99 235 / .3)`
7. **No pure black text**: Primary text is `#0F172A` (slate-900), not `#000`
8. **Card hover glow**: `box-shadow: 0 20px 25px -5px rgb(37 99 235 / .1)` — blue-tinted elevation
9. **Supports dark mode**: Toggle via `class="dark"` on `<html>`, backgrounds shift to near-black `#0B0B10`
