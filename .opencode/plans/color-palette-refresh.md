# Color Palette Refresh: Deep Teal + Copper

## New CSS Variables (in `assets/css/style.css`)

```css
--teal:         #0D4F4F    (replaces --navy #0B1F3A)
--teal-light:   #1A6B6B    (replaces --navy-light #132B52)
--teal-dark:    #083636    (replaces --navy-dark #0A1628)
--copper:       #D4735E    (replaces --gold #C9A84C)
--copper-light: #E08E7C    (replaces --gold-light #D4B86A)
--copper-dark:  #B85A46    (replaces --gold-dark #A68C3E)
--bg-warm:      #FDFBF7    (new — warm cream background)
--success:      #2E9F6E    (adjusted green for harmony)
```

## Steps (in order)

### 1. `assets/css/style.css` — Replace CSS variable definitions
- `--navy` → `--teal`, `--navy-light` → `--teal-light`, `--navy-dark` → `--teal-dark`
- `--gold` → `--copper`, `--gold-light` → `--copper-light`, `--gold-dark` → `--copper-dark`
- Add `--bg-warm: #FDFBF7;`
- Change `--success: #10B981` → `#2E9F6E`
- Leave the rest unchanged — ~140 references auto-update

### 2. `assets/css/home.css` — Two hardcoded amber stars
- Line 256: `color: #F59E0B;` → `color: var(--copper-light);`
- Line 795: `color: #F59E0B;` → `color: var(--copper-light);`

### 3. `admin/css/admin.css` ~13 hardcoded color replacements
All `#F59E0B` → `var(--copper)` (or `#D4735E` if not using vars)
All `#C9A84C` → `var(--copper)`
Line 222 `color: #F59E0B;` → `color: var(--copper);`
Line 402 `border-left: 3px solid #F59E0B;` → `var(--copper)`
etc.

### 4. `admin/index.html` — 8 inline gold icons
Replace `color:#C9A84C` → `color:var(--copper)` in all inline style attributes on admin card headers.

### 5. HTML files — hardcoded gold rgba backgrounds (6 lines)
- `contact.html` lines 253, 257, 261: `rgba(201,168,76,0.1)` → `rgba(212,115,94,0.1)`

### 6. Add `--bg-warm` usage where appropriate
Backgrounds on auth sections, hero sections can optionally use `var(--bg-warm)` for a warmer feel.
