---
name: design-system
description: >-
  Apply clean, light, modern UI design to any application. Use this skill whenever the user
  asks to design, style, theme, beautify, improve, or fix the UI/UX of any application —
  web, mobile, desktop, or notifications. Also use when creating new components, pages, 
  layouts, or making any visual design decisions. Even if the user doesn't say "design" — 
  if they're building UI, styling elements, picking colors, choosing fonts, laying out pages,
  creating forms, buttons, cards, or anything user-facing, this skill applies. This skill 
  gives you SPECIFIC instructions on exactly what CSS/style changes to make, not just 
  general principles. Follow the step-by-step process below.
---

# Design System

This skill tells you exactly how to make any UI look like a modern 2026 app — the kind of 
clean, light, airy aesthetic you see in Apple's apps, Linear, Notion, Vercel, or Arc browser.

## What "Good" Looks Like in 2026

The target aesthetic is **light, spacious, and quiet**. Think of it this way: if you squint 
at the screen, you should see mostly white/light gray with tiny touches of color. The 
interface should feel like a calm, well-lit room — not a crowded dashboard.

**Reference apps to emulate** (study their visual style):
- **Linear** (linear.app) — The gold standard for clean SaaS UI
- **Notion** — Warm, readable, generous whitespace
- **Apple HIG / Liquid Glass** — Light translucent surfaces, subtle depth
- **Vercel** — Crisp black/white with surgical accent color use
- **Arc Browser** — Soft colors, rounded but not bubbly
- **Raycast** — Extremely clean command-palette aesthetic
- **Stripe Dashboard** — Professional, data-dense but still clean
- **claude.ai** — Anthropic's UI is a perfect reference: warm grays, minimal accent, sentence case everywhere

**Key insights from testing (learned through iterations):**
- **Toggle/segmented controls**: Apple-style white selected tab on gray bg with tiny shadow 
  is better than dark filled tab. It feels lighter.
- **Navigation steppers**: Active dots should use near-black (#1C1C1C), NOT accent blue. 
  Accent is only for CTAs.
- **Card shadows**: Use `0 1px 2px rgba(0,0,0,0.03)` — barely visible. Most cards should 
  rely on border, not shadow.
- **Form labels**: Uppercase at 11px, weight 500, color #A0A0A0 — they should barely be 
  noticed.
- **Drop zones**: Should look almost invisible by default. Gray dashed border, #FAFAFA bg. 
  Content in dark gray, not bold.
- **Disabled buttons**: opacity 0.35, pointer-events none. They shouldn't draw the eye.
- **Text rendering**: Add `text-rendering: optimizeLegibility` for crisper Inter font.
- **Always deploy with API**: When deploying to SWA or similar, include the API backend 
  (`--api-location api`). Frontend-only deploys can overwrite the API.

## Step-by-Step: How to Redesign a UI

When asked to improve/redesign any UI, follow this exact process:

### Step 1: Audit the Current UI

Read the existing code and identify these specific problems (most UIs have all of them):

1. **Too much saturated color** — Large filled areas of blue, orange, red. Fix: reduce to 
   tiny accents only.
2. **Heavy borders and outlines** — Thick colored borders around cards/sections. Fix: remove 
   or make nearly invisible (1px, very light gray).
3. **Busy backgrounds** — Yellow, beige, or colored backgrounds on info sections. Fix: use 
   white or near-white only.
4. **Too many font weights/sizes** — Bold everywhere loses hierarchy. Fix: use weight 400 
   for most text, 500 for emphasis, 600 only for titles.
5. **Cramped spacing** — Elements too close together. Fix: add generous padding and gaps.
6. **Too many visual layers** — Nested boxes, borders inside borders. Fix: flatten. One 
   level of containment max.
7. **Outdated patterns** — Heavy shadows, gradient buttons, colored badges. Fix: replace 
   with flat, subtle alternatives.

### Step 2: Apply the Color System

This is the most important step. The entire palette is almost monochrome with ONE accent.

**Light theme (DEFAULT — always use this unless user asks for dark):**

```css
/* Backgrounds — almost all white */
--bg-page:          #FAFAFA;      /* Page background — barely warm gray */
--bg-card:          #FFFFFF;      /* Card/section background — pure white */
--bg-subtle:        #F5F5F4;      /* Subtle distinction — secondary areas */
--bg-hover:         #F0EFEE;      /* Hover state backgrounds */
--bg-active:        #EAEAE8;      /* Active/pressed states */

/* Text — gray scale, NOT black */
--text-primary:     #1C1C1C;      /* Headings, important text — near-black */
--text-body:        #3C3C3C;      /* Body text — dark gray, very readable */
--text-secondary:   #787878;      /* Descriptions, metadata — medium gray */
--text-tertiary:    #A0A0A0;      /* Placeholders, hints — light gray */

/* Accent — use SPARINGLY. Only for: primary button, links, active tab indicator */
--accent:           #0A84FF;      /* Apple-style blue — only for interactive elements */
--accent-hover:     #0070E0;      /* Slightly darker on hover */
--accent-bg:        #F0F7FF;      /* Very faint blue tint — for selected row or active tab bg */

/* Semantic colors — muted versions, NOT saturated */
--success:          #34C759;      /* Green — iOS style */
--success-bg:       #F0FBF4;      /* Barely green background */
--warning:          #FF9500;      /* Amber — iOS style */
--warning-bg:       #FFFBF0;      /* Barely amber background */
--error:            #FF3B30;      /* Red — iOS style */
--error-bg:         #FFF5F5;      /* Barely red background */

/* Borders — barely visible. This is critical. */
--border:           #E8E8E8;      /* Default — very subtle */
--border-hover:     #D4D4D4;      /* On hover — slightly more visible */
--border-focus:     #0A84FF;      /* Focus ring — accent color, 2px */
```

**Rules (STRICTLY FOLLOW — these are the most common mistakes):**

1. **Accent color budget: max ~5% of screen pixels.** Accent (#0A84FF) is ONLY for:
   - ONE primary action button per screen (the final/submit button)
   - Links (text only)
   - Focus rings
   - Thin progress bar fill (3-4px tall)
   - Active tab indicator (thin 2px line or text color only)
   - **That's it. Everything else is grayscale.**

2. **NO colored category labels.** Labels like "EXERCISE", "WARMUP", "STATUS" etc:
   - Color: `#787878` (medium gray) — NEVER orange, red, blue, green
   - Style: `font-size: 11px; font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase; color: #787878;`
   - No background. No colored text. Just small gray uppercase text.
   - This is how Linear, Notion, and Apple apps show category labels.

3. **NO colored info/description blocks.** Text blocks showing instructions, descriptions,
   previous results, tips, etc.:
   - Background: `#FFFFFF` (same as card) or `#F5F5F4` (barely different from page)
   - NEVER use yellow, beige, cream, light blue, or any tinted background
   - If you need visual separation, use only a 1px `#E8E8E8` top border or extra spacing

4. **Background is almost all white.** 90%+ of the page: `#FAFAFA` or `#FFFFFF`.

5. **Borders: 1px #E8E8E8 only.** No colored borders. Many elements need NO border at all.

6. **ONE accent color per app.** Don't mix blue AND orange buttons. Pick ONE color for 
   all primary actions. Secondary actions are always gray/outlined.

### Step 3: Apply Typography

Use **one font family** with different weights. Choose from the font matrix below.

#### Font Recommendation Matrix (All Free & Open Source)

Pick the font that matches the personality of the project. ALL fonts below are free
(Google Fonts or open-source). Never use a paid font without confirming the license.

**Sans-serif (body & UI) — pick ONE:**

| Font | Personality | Best for | Get it | Notes |
|---|---|---|---|---|
| **Inter** | Neutral, precise, workhorse | App UIs, dashboards, tools | [Google Fonts](https://fonts.google.com/specimen/Inter) / [rsms.me/inter](https://rsms.me/inter/) | The default choice. Variable font, 2000+ glyphs, 147 languages. Used everywhere: GitHub, Figma, Linear |
| **Geist** | Minimal, developer-focused | Dev tools, SaaS, technical products | [Google Fonts](https://fonts.google.com/specimen/Geist) / [vercel.com/font](https://vercel.com/font) | Vercel's typeface. Swiss design influence. Includes Geist Mono for code |
| **DM Sans** | Geometric, friendly | Marketing pages, creative products | [Google Fonts](https://fonts.google.com/specimen/DM+Sans) | Low contrast, optically corrected. Pairs well with DM Serif Display |
| **Plus Jakarta Sans** | Warm, rounded, approachable | Consumer apps, fintech, health | [Google Fonts](https://fonts.google.com/specimen/Plus+Jakarta+Sans) | Indonesian design. Slightly playful but still professional |
| **Outfit** | Clean, geometric, modern | Landing pages, startups | [Google Fonts](https://fonts.google.com/specimen/Outfit) | Variable weight 100-900. Geometric but not cold |
| **Satoshi** | Premium, editorial | Brand-heavy products, agencies | [fontshare.com](https://www.fontshare.com/fonts/satoshi) | Free from Indian Type Foundry. Distinctive but readable |
| **Manrope** | Soft, modern, versatile | SaaS, productivity tools | [Google Fonts](https://fonts.google.com/specimen/Manrope) | Semi-rounded terminals. Variable font |
| **Albert Sans** | Neutral geometric | Corporate, enterprise apps | [Google Fonts](https://fonts.google.com/specimen/Albert+Sans) | Wide character set, very clean |
| **Space Grotesk** | Techy, slightly quirky | Developer tools, crypto, gaming | [Google Fonts](https://fonts.google.com/specimen/Space+Grotesk) | Proportional counterpart to Space Mono |

**Serif (headings & editorial accents only) — optional:**

| Font | Personality | Best for | Get it |
|---|---|---|---|
| **DM Serif Display** | Elegant, high contrast | Hero headings over DM Sans body | [Google Fonts](https://fonts.google.com/specimen/DM+Serif+Display) |
| **Fraunces** | Quirky, expressive, old-style | Playful brands, editorial | [Google Fonts](https://fonts.google.com/specimen/Fraunces) |
| **Playfair Display** | Classic, refined | Luxury, fashion, editorial | [Google Fonts](https://fonts.google.com/specimen/Playfair+Display) |
| **Lora** | Warm, balanced, calligraphic | Long-form reading, blogs | [Google Fonts](https://fonts.google.com/specimen/Lora) |
| **Source Serif 4** | Clean, professional | Documentation, news | [Google Fonts](https://fonts.google.com/specimen/Source+Serif+4) |

**Monospace (code blocks & technical data only):**

| Font | Get it | Notes |
|---|---|---|
| **Geist Mono** | [Google Fonts](https://fonts.google.com/specimen/Geist+Mono) | Best all-rounder. Pairs with Geist Sans |
| **JetBrains Mono** | [Google Fonts](https://fonts.google.com/specimen/JetBrains+Mono) | Ligatures, tall x-height. The dev favorite |
| **Fira Code** | [Google Fonts](https://fonts.google.com/specimen/Fira+Code) | Great ligatures, Mozilla origin |
| **IBM Plex Mono** | [Google Fonts](https://fonts.google.com/specimen/IBM+Plex+Mono) | Clean, corporate feel |

**System font stacks (zero-download, instant load):**
```css
/* Modern system stack — best performance, looks native on each OS */
--font-system: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;

/* Mono system stack */
--font-mono: ui-monospace, 'Cascadia Code', 'Source Code Pro', Menlo, Consolas, monospace;
```
Use system fonts when performance is critical or you want zero layout shift.

#### Font Pairing Rules

Most apps need just ONE font family. But if you want more personality:

**Safe pairings (all free, tested together):**

| Heading font | Body font | Vibe |
|---|---|---|
| **DM Serif Display** | **DM Sans** | Elegant product page |
| **Playfair Display** | **Inter** | Editorial, luxury feel |
| **Fraunces** | **Plus Jakarta Sans** | Playful, distinctive brand |
| **Source Serif 4** | **Inter** | Professional documentation |
| **Space Grotesk** (bold) | **Inter** | Techy, developer-focused |

**Pairing rules:**
- Never pair two sans-serifs (too similar, creates confusion)
- Never pair two serifs (too busy, fights for attention)
- Serif headings + sans-serif body is the classic reliable pairing
- Match x-height between heading and body fonts (they should feel balanced)
- Use the heading font ONLY for h1/h2 — h3 and below should use the body font
- When in doubt, use ONE font family with weight variation. It always works.

```css
/* Font */
--font-sans:        'Inter', system-ui, -apple-system, sans-serif;

/* Sizes — small range, not dramatic jumps */
--text-xs:          0.75rem;     /* 12px — timestamps, badges */
--text-sm:          0.8125rem;   /* 13px — secondary text, metadata */
--text-base:        0.875rem;    /* 14px — body text (standard for modern apps) */
--text-md:          1rem;        /* 16px — emphasized body, nav items */
--text-lg:          1.125rem;    /* 18px — section titles */
--text-xl:          1.375rem;    /* 22px — page titles */
--text-2xl:         1.75rem;     /* 28px — hero/main title */

/* Weights */
--weight-normal:    400;         /* Body text, descriptions */
--weight-medium:    500;         /* Emphasis, labels, nav items */
--weight-semibold:  600;         /* Page titles, section headers ONLY */

/* Line height */
--leading-tight:    1.3;         /* Headings */
--leading-normal:   1.5;         /* Body text */
--leading-relaxed:  1.65;        /* Long-form reading */

/* Letter spacing */
--tracking-tight:   -0.01em;     /* Large headings — slightly tighter */
--tracking-normal:  0;           /* Body text */
--tracking-wide:    0.02em;      /* Uppercased labels — open up a bit */
```

**Rules (STRICTLY FOLLOW):**
- Base font size is `14px` for app UIs (not 16px — that's for articles/blogs). Modern apps 
  like Linear, Figma, Notion all use 13-14px body text.
- Headings: `font-weight: 600` max. Never use 700/800/bold for headings. It's too heavy.
- Body text: `font-weight: 400`. Metadata/secondary: also 400 but smaller and lighter color.
- Labels and uppercase text: add `letter-spacing: 0.02em` and use `text-transform: uppercase` 
  with `font-size: 11px; font-weight: 500; color: var(--text-secondary)`.

### Step 3b: Apply Text Formatting & Capitalization

Typography isn't just fonts and sizes — it's also **how you format the words themselves**.
Capitalization, punctuation, and text structure are critical and most apps get them wrong.
These rules are synthesized from Apple HIG, Microsoft Writing Style Guide, Google Material
Design, Google Developer Style Guide, and Anthropic's design principles.

#### The 5 Capitalization Styles

| Style | Example | CSS |
|---|---|---|
| **Sentence case** | "Upload your file" | (no CSS needed — write it this way) |
| **Title Case** | "Upload Your File" | (no CSS needed — write it this way) |
| **UPPERCASE** | "UPLOAD" | `text-transform: uppercase;` |
| **lowercase** | "upload your file" | `text-transform: lowercase;` |
| **Capitalize Each** | "Upload Your File" | `text-transform: capitalize;` (unreliable — capitalize in code instead) |

#### The Modern Default: Sentence Case

**All three major companies (Apple, Microsoft, Google) now recommend sentence case as the
default** for nearly all UI text. Sentence case means: capitalize only the first word and
proper nouns, lowercase everything else.

Why sentence case wins:
- **Easier to read** — mixed case gives words recognizable shapes; all-caps looks like rectangles
- **Feels more natural** — reads like normal speech, less corporate/formal
- **Better for scanning** — proper nouns stand out when everything else is lowercase
- **Localization-friendly** — many languages don't have capital letters; sentence case translates better
- **Modern aesthetic** — Linear, Notion, Vercel, Stripe, Arc all use sentence case

#### Capitalization Rules by UI Element

Follow this table STRICTLY. This is the consensus across Apple, Microsoft, Google, and
modern SaaS apps:

| UI Element | Case Style | Example | Notes |
|---|---|---|---|
| **Page titles** | Sentence case | "Account settings" | NOT "Account Settings" |
| **Section headings** | Sentence case | "Payment methods" | NOT "Payment Methods" |
| **Subheadings** | Sentence case | "Add a new card" | NOT "Add A New Card" |
| **Button labels** | Sentence case | "Save changes" | NOT "Save Changes" |
| **Navigation / tabs** | Sentence case | "My projects" | NOT "My Projects" |
| **Menu items** | Sentence case | "Export as PDF" | NOT "Export As PDF" |
| **Form field labels** | Sentence case | "Email address" | NOT "Email Address" |
| **Placeholder text** | Sentence case | "Enter your name" | NOT "Enter Your Name" |
| **Tooltip text** | Sentence case | "Copy to clipboard" | Short, no period |
| **Error messages** | Sentence case | "That password is too short" | NOT "Error: Invalid Input!" |
| **Success messages** | Sentence case | "Changes saved" | NOT "Changes Saved!" |
| **Dialog/modal titles** | Sentence case | "Delete this item?" | NOT "Delete This Item?" |
| **Toggle/switch labels** | Sentence case | "Show advanced options" | NOT "Show Advanced Options" |
| **Checkbox/radio labels** | Sentence case | "Remember me" | NOT "Remember Me" |
| **Empty state text** | Sentence case | "No results found" | Add guidance on next steps |
| **Category labels/tags** | UPPERCASE | "EXERCISE", "STATUS" | 11px, gray, letter-spacing: 0.06em |
| **Badge text** | UPPERCASE | "NEW", "PRO", "BETA" | Tiny, muted colors |
| **Breadcrumbs** | Sentence case | "Home > Settings > Profile" | Match the actual page title |
| **Footer links** | Sentence case | "Privacy policy" | NOT "Privacy Policy" |
| **Product/brand names** | As branded | "GitHub", "macOS", "iPhone" | Always match the official casing |
| **Acronyms/abbreviations** | UPPERCASE | "API", "URL", "PDF" | Never "Api" or "Url" |

#### Special Cases: When NOT to Use Sentence Case

**Title case** is acceptable only in these specific situations:
- Product and service names (e.g., "Visual Studio Code", "Google Cloud Platform")
- Legal/formal text (copyright notices, terms of service headings)
- Book, song, or movie titles in citations
- Marketing headlines where the brand intentionally uses title case
- People's titles before names (e.g., "Vice President of Engineering")

**UPPERCASE** is acceptable only for:
- Category labels / tags: `font-size: 11px; font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase; color: #787878;`
- Very short badge text: "NEW", "PRO", "BETA" (max 1-2 words)
- Acronyms that are always uppercase: "API", "HTML", "URL"
- **NEVER for emphasis.** Use italic sparingly instead. (Microsoft Writing Style Guide)
- **NEVER for full sentences.** "THIS IS HARD TO READ" — always avoid.

**all lowercase** — avoid this entirely:
- Microsoft: "Don't use all lowercase as a design choice"
- Capital letters help readers recognize new sections and sentence starts
- Exception: brand identity that specifically requires it (rare)

#### Text Structure & Punctuation Rules

**Headings and titles:**
- No period at the end of headings or titles (all companies agree)
- Keep headings short — aim for 3-8 words
- Use action verbs for task headings: "Create a project" not "Project creation"
- Don't use articles in short headings: "Settings" not "The Settings"
- If a heading has a colon, capitalize the first word after it: "Step 1: Configure the server"

**Button labels:**
- Use clear action verbs: "Save", "Delete", "Upload file"
- 1-3 words ideal. Never a full sentence.
- No period, no exclamation mark
- Be specific: "Save changes" is better than "OK" or "Submit"
- Destructive actions: be explicit — "Delete account" not just "Delete"
- Don't start with "Click" or "Press" — the button IS the action

**Form labels:**
- Keep labels above or to the left of the field
- No colons after form labels (modern convention — Google, Apple)
- Placeholder text should be an example or short instruction, not a repeat of the label
- Don't rely solely on placeholder text — it disappears when typing

**Error messages:**
- Don't blame the user: "Password must be 8+ characters" NOT "You entered an invalid password"
- Be specific about what to fix: "Enter a valid email" NOT "Invalid input"
- No exclamation marks — they feel aggressive
- No "Oops!" or "Uh oh!" — they sound insincere (Apple HIG)
- Place errors close to the problem, not in a generic banner

**Notifications and toasts:**
- Start with what happened: "File uploaded" not "Your file has been successfully uploaded"
- Keep under 10 words when possible
- No trailing periods on single-sentence notifications

**Lists and descriptions:**
- Use parallel structure: all items start the same way (all verbs, or all nouns)
- Good: "Create projects", "Manage users", "View reports"
- Bad: "Create projects", "User management", "Viewing reports"

**Numbers and dates:**
- Spell out numbers 1-9, use digits for 10+ (except in tables or data-heavy UI)
- Use relative dates when recent: "2 hours ago", "Yesterday"
- Be consistent with date format throughout the app

#### Capitalization in Code and Technical UI

When showing code elements, variable names, or technical identifiers in the UI:
- Don't change the casing of code terms — show them as they appear in code
- Use code font (monospace) to distinguish technical terms from regular text
- `camelCase` and `snake_case` stay as-is — never "fix" their capitalization
- File extensions stay lowercase: ".pdf", ".json"
- API names stay as documented: "REST API", "GraphQL"

#### Cross-Company Consensus Summary

| Rule | Apple | Microsoft | Google |
|---|---|---|---|
| Default UI text | Sentence case (recommended) | Sentence case (required) | Sentence case (required) |
| Headings | Sentence or title case (choose one, be consistent) | Sentence case | Sentence case |
| Buttons | Match your chosen style consistently | Sentence case | Sentence case |
| All-caps for emphasis | Avoid | Don't use | Don't use |
| All-lowercase text | — | Don't use | — |
| Colons in headings | Capitalize after colon | Capitalize after colon | Capitalize after colon |
| Hyphenated words | Capitalize first element only | Capitalize if would be capped independently | Capitalize first element only |
| Product names | Always capitalize | Always capitalize | Always capitalize |
| Internal capitalization | Don't use unless brand name | Don't use unless brand name | Don't use |

**The takeaway: when in doubt, use sentence case. It's the modern standard.**

### Step 4: Apply Spacing

Modern UIs breathe. There is generous space between everything.

```css
--space-1:    4px;
--space-2:    8px;
--space-3:    12px;
--space-4:    16px;
--space-5:    20px;
--space-6:    24px;
--space-8:    32px;
--space-10:   40px;
--space-12:   48px;
--space-16:   64px;
```

**Where to use what:**
- Padding inside buttons: `8px 16px` (small) or `10px 20px` (regular)
- Padding inside cards: `20px` to `24px`
- Gap between items in a list: `8px` to `12px`
- Gap between sections on a page: `32px` to `48px`
- Page side margins (mobile): `16px` to `20px`
- Page side margins (desktop): `24px` to `40px`

### Step 5: Apply Borders and Radius

```css
/* Radius — use ONE consistent level across the whole app */
--radius-sm:      6px;      /* Buttons, inputs, small elements */
--radius-md:      10px;     /* Cards, panels */
--radius-lg:      14px;     /* Modals, large containers */
--radius-full:    9999px;   /* Pills, avatars, progress bars */

/* Borders */
--border-width:   1px;
--border-color:   #E8E8E8;
--border:         1px solid #E8E8E8;
```

**Rules:**
- Pick `radius-sm` (6px) OR `radius-md` (10px) for the project. Use it everywhere.
- Don't mix 4px, 8px, 12px, 20px radius on the same page.
- Borders: use sparingly. Prefer spacing or background color differences to separate areas.
- Never use colored borders (blue border around active card is outdated). Use a subtle 
  shadow or background tint instead.

### Step 6: Apply Shadows

Minimal, soft, barely-there shadows:

```css
--shadow-xs:      0 1px 2px rgba(0,0,0,0.04);
--shadow-sm:      0 1px 3px rgba(0,0,0,0.05), 0 1px 2px rgba(0,0,0,0.03);
--shadow-md:      0 4px 12px rgba(0,0,0,0.06);
--shadow-lg:      0 8px 24px rgba(0,0,0,0.08);
```

Cards should use `shadow-sm` at most. Modals use `shadow-lg`. Most elements: no shadow.

### Step 7: Fix Specific Components

#### Buttons
```css
/* Primary — only ONE per screen section */
.btn-primary {
  background: var(--accent);
  color: white;
  font-weight: 500;
  font-size: 14px;
  padding: 10px 20px;
  border: none;
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: background 0.15s ease;
}
.btn-primary:hover { background: var(--accent-hover); }

/* Secondary — for all other actions */
.btn-secondary {
  background: transparent;
  color: var(--text-body);
  font-weight: 500;
  font-size: 14px;
  padding: 10px 20px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
}
.btn-secondary:hover { background: var(--bg-hover); }

/* Ghost / Tertiary — minimal presence */
.btn-ghost {
  background: transparent;
  color: var(--text-secondary);
  font-weight: 400;
  padding: 8px 12px;
  border: none;
}
.btn-ghost:hover { background: var(--bg-hover); color: var(--text-body); }
```

**What to fix on buttons (CRITICAL — most apps get this wrong):**

- **NEVER make buttons full-width** unless it's a mobile bottom action bar.
  Full-width colored buttons look dated (2018 Material Design). Modern buttons are compact:
  - Width: `auto` (sized to content + padding). NOT `width: 100%`.
  - Exception: a bottom sticky action bar on mobile can have a full-width button, but it 
    should be slim (40px tall, not 48-56px).
  - If the button MUST span a container (form submit), use `width: 100%` but with reduced
    height (38-40px), lighter font weight, and smaller font size (14px).
  - **Disabled buttons**: should feel nearly invisible. Use `opacity: 0.35` and keep the 
    same bg as enabled but muted. NEVER make a disabled button still visually dominant.
  
- **REDUCE button size.** Most buttons in modern apps are smaller than you think:
  - Height: 36-40px (not 48px or 56px)
  - Font: 14px, weight 500 (never 600, 700, or bold)
  - Padding: `8px 16px` (compact) or `10px 20px` (standard)
  - Border-radius: 6-8px (not 12px+ — that's too bubbly)
  - **Watch for CSS flex stretch**: if buttons are in a `display:flex` container with 
    `flex:1` on children, they'll stretch to fill. Use `flex: 0 0 auto` to keep buttons 
    compact. Place in a container with `justify-content: flex-end` to right-align.
  
- **Only ONE filled accent button per view.** The final/submit/primary CTA.
  All other buttons: outlined (secondary) or text-only (ghost).
  
- **Don't mix accent colors.** If the primary button is blue, the secondary/completion 
  button is also blue — not orange, not green. ONE color.

#### Cards and Containers
```css
.card {
  background: var(--bg-card);
  border: 1px solid var(--border);  /* OR shadow, not both */
  border-radius: var(--radius-md);
  padding: 20px;
}
```

**What to fix on cards:**
- REMOVE colored borders (blue, orange, etc.)
- REMOVE colored/tinted backgrounds (yellow, beige, light blue)
- Background is always white (#FFFFFF)
- Border is always gray (#E8E8E8) or no border (use shadow-sm instead)

#### Inputs and Forms
```css
.input {
  height: 38px;
  padding: 0 12px;
  font-size: 14px;
  color: var(--text-body);
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  transition: border-color 0.15s ease;
}
.input:focus {
  border-color: var(--accent);
  outline: none;
  box-shadow: 0 0 0 3px var(--accent-bg);
}
```

#### Status Badges and Labels
```css
/* Muted pill badges — NOT bright colored blocks */
.badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  font-weight: 500;
  padding: 2px 8px;
  border-radius: 9999px;
  background: var(--bg-subtle);
  color: var(--text-secondary);
}
.badge-success {
  background: var(--success-bg);
  color: #1A7F37;  /* Muted green text, NOT bright green */
}
```

**What to fix on badges/labels:**
- REMOVE bright colored background badges (red label on orange bg)
- Replace with tiny muted pills: faint bg + darker text of same hue
- Or even simpler: just colored text, no background at all
- Emoji in labels is fine for personality — but the surrounding style must be subtle

#### File Drop Zones / Upload Areas
```css
.drop-zone {
  border: 1.5px dashed #D4D4D4;    /* Gray dashed, NOT accent colored */
  border-radius: var(--radius-md);
  padding: 40px 16px;
  text-align: center;
  background: #FAFAFA;              /* Very subtle, almost same as page */
  cursor: pointer;
  transition: border-color 0.15s, background 0.15s;
}
.drop-zone:hover {
  border-color: #A0A0A0;           /* Darker gray, NOT accent blue */
  background: #F5F5F4;             /* Slightly more visible */
}
.drop-zone.active {                /* File being dragged over */
  border-color: var(--accent);     /* Only during active drag = accent */
  background: #F8FBFF;             /* Barely blue tint */
}
```

**Rules for drop zones:**
- Default border: gray dashed, NOT accent-colored
- Hover: darken border to medium gray, do NOT turn blue
- Only during active drag-over: accent blue border is acceptable
- Background: `#FAFAFA` default, never bright blue/accent tint
- When file is loaded/filled: show solid border, gray, with the preview inside

#### Footer
```css
footer {
  text-align: center;
  padding: 24px 0 16px;
  border-top: 1px solid #E8E8E8;   /* Subtle separator */
  margin-top: 24px;
}
footer p {
  font-size: 12px;
  color: #A0A0A0;                  /* Light gray — very quiet */
  font-weight: 400;
}
```

#### Progress Indicators
```css
.progress-bar {
  height: 4px;               /* THIN — not 8px or 12px */
  background: var(--bg-subtle);
  border-radius: 9999px;
  overflow: hidden;
}
.progress-bar-fill {
  height: 100%;
  background: var(--accent);
  border-radius: 9999px;
  transition: width 0.3s ease;
}
```

**Progress bars should be THIN (3-4px). Not thick chunky bars.**

#### Selection / Toggle Buttons (like difficulty selectors)
```css
/* Chip-style selection (e.g., Easy / Normal / Hard) */
.chip {
  padding: 8px 16px;
  font-size: 14px;
  font-weight: 400;
  color: var(--text-secondary);
  background: transparent;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: all 0.15s ease;
}
.chip:hover { background: var(--bg-hover); color: var(--text-body); }
.chip-selected {
  background: var(--accent-bg);   /* Very faint blue — NOT solid blue */
  color: var(--accent);           /* Blue text */
  border-color: var(--accent);    /* Blue border — thin */
  font-weight: 500;
}
```

### Step 8: Fix Layout and Spacing Issues

**Typical problems and fixes:**
- Content touching edges → add `padding: 16px 20px` on mobile containers
- Sections cramped together → add `margin-bottom: 32px` between sections
- List items with no breathing room → add `gap: 8px` or `padding: 12px 0` per item
- Inconsistent alignment → pick left-align for everything (centered only for hero/empty states)

### Step 9: Fix Large Numbers and Metrics

Apps often display key numbers (reps, score, count, price). Modern style:

```css
.metric-value {
  font-size: 28px;         /* NOT 48px — keep proportional */
  font-weight: 600;        /* NOT 900 or black */
  color: var(--text-primary);  /* Dark gray, NOT accent blue */
  line-height: 1.1;
  letter-spacing: -0.02em;
}
.metric-label {
  font-size: 11px;
  font-weight: 500;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  margin-top: 4px;
}
```

**Rules for numbers/metrics:**
- Color: `#1C1C1C` (near-black). NEVER accent blue for display numbers.
- Size: 24-32px. Not 48px+. Large numbers look dated and amateur.
- Weight: 600 max. Not 700, 800, 900, or `bold`.
- The label below ("reps", "goal", "total") is tiny gray uppercase at 11px.

### Step 10: Fix Previous Data / Info Rows

Rows showing historical data, metadata, or contextual info ("Last time: 9/9 · Easy"):

```css
.info-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  font-size: 13px;
  color: var(--text-secondary);  /* Gray text — not dark */
  background: transparent;        /* NO background tint */
  border-radius: 6px;
}
```

**Rules:**
- Background: `transparent` or `#F5F5F4` at most. NO tinted/colored backgrounds.
- Text: `--text-secondary` (#787878). Not primary dark text — this is supporting info.
- Icons/emoji: keep inline, small, doesn't need special styling.
- If you need visual grouping, use `border-top: 1px solid #E8E8E8` or whitespace. Not background color.

## Before/After Patterns

These show exactly what to change when you encounter common dated patterns:

### Full-width chunky button → Right-aligned compact button
Before: `width: 100%; background: #2563EB; color: white; font-weight: 700; padding: 16px 32px; font-size: 18px; border-radius: 12px;`
After: `width: auto; background: #0A84FF; color: white; font-weight: 500; padding: 10px 20px; font-size: 14px; border-radius: 6px;` placed in a `display:flex; justify-content:flex-end` container.
If it MUST be full-width (mobile CTA): `height: 40px; font-size: 14px; font-weight: 500; border-radius: 8px;`

### Active stepper/tab indicator → Near-black, not accent
Before: `background: #0A84FF;` for active step dot
After: `background: #1C1C1C;` — Active states use near-black, not accent blue. This is the Linear/Vercel pattern — accent is for CTAs only, not navigation state.

### Orange/colored category label → Gray uppercase
Before: `color: #E65100; font-weight: 700; font-size: 14px; text-transform: uppercase;`
After: `color: #787878; font-weight: 600; font-size: 11px; text-transform: uppercase; letter-spacing: 0.06em;`

### Colored card border → Subtle card
Before: `border: 2px solid #2563EB; background: #F0F7FF; border-radius: 16px;`
After: `border: 1px solid #E8E8E8; background: #FFFFFF; border-radius: 10px;`

### Yellow/beige info box → Clean info section
Before: `background: #FFF8E1; border-left: 4px solid #FFB300; padding: 12px;`
After: `background: #F5F5F4; border-radius: 8px; padding: 16px;` (or just `background: transparent;`)

### Colored info row → Neutral info row  
Before: `background: #FFF3E0; padding: 8px 12px; border-radius: 6px;`
After: `background: transparent; padding: 8px 0; color: #787878; font-size: 13px;`

### Bold colored status label → Muted text label
Before: `background: #FF5722; color: white; padding: 4px 12px; font-weight: 700; font-size: 14px;`
After: `background: transparent; color: #787878; font-weight: 600; font-size: 11px; text-transform: uppercase; letter-spacing: 0.06em;`

### Large accent-colored number → Clean number
Before: `font-size: 48px; font-weight: 900; color: #2563EB;`
After: `font-size: 28px; font-weight: 600; color: #1C1C1C; letter-spacing: -0.02em;`

### Mixed orange+blue buttons → Unified color
Before: Primary blue, completion green, cancel red — 3+ accent colors
After: ONE accent for all primary actions, everything else is gray outlined/ghost

## Dark Mode

Only implement if the user asks for it. When you do:

```css
[data-theme="dark"] {
  --bg-page:        #0A0A0A;
  --bg-card:        #141414;
  --bg-subtle:      #1C1C1C;
  --bg-hover:       #242424;

  --text-primary:   #ECECEC;
  --text-body:      #B8B8B8;
  --text-secondary: #787878;
  --text-tertiary:  #525252;

  --accent:         #4DA3FF;
  --accent-bg:      #0D2240;

  --border:         #2A2A2A;
  --border-hover:   #3A3A3A;
}
```

### Step 11: Apply Motion & Micro-interactions

Motion should be **purposeful, brief, and subtle** — never decorative. Apple HIG says:
"Don't add motion for the sake of adding motion." Google M3 uses spring-based physics
for natural feel. Both agree: less is more.

```css
/* Transition tokens — use these everywhere */
--duration-fast:    100ms;    /* Hover color changes, opacity toggles */
--duration-normal:  150ms;    /* Button state changes, border color */
--duration-slow:    250ms;    /* Card expand/collapse, panel slides */
--duration-enter:   200ms;    /* Elements appearing (slightly slower than exit) */
--duration-exit:    150ms;    /* Elements disappearing (faster — feels snappier) */

/* Easing curves */
--ease-out:         cubic-bezier(0.16, 1, 0.3, 1);    /* Elements entering — decelerate */
--ease-in:          cubic-bezier(0.5, 0, 1, 0.5);     /* Elements exiting — accelerate */
--ease-in-out:      cubic-bezier(0.33, 0, 0.67, 1);   /* Position changes */
--ease-spring:      cubic-bezier(0.34, 1.56, 0.64, 1); /* Playful bounce (use sparingly) */
```

**What gets transitions (ALWAYS add these):**
```css
/* Buttons, links, interactive elements */
transition: background var(--duration-normal) var(--ease-out),
            color var(--duration-normal) var(--ease-out),
            border-color var(--duration-normal) var(--ease-out),
            box-shadow var(--duration-normal) var(--ease-out);

/* Cards on hover */
transition: box-shadow var(--duration-slow) var(--ease-out),
            transform var(--duration-slow) var(--ease-out);

/* Don't transition these — they cause layout thrashing */
/* NEVER: transition: all; — always name specific properties */
```

**What does NOT get transitions:**
- `display`, `visibility` — use opacity instead
- `width`, `height` on complex layouts — causes jank. Use `transform: scale()` instead
- Anything on scroll — it's too laggy. Only use CSS scroll-snap or intersection observers

**Hover micro-interactions (subtle is key):**
```css
/* Card lift — barely perceptible */
.card:hover {
  box-shadow: var(--shadow-md);
  transform: translateY(-1px);  /* Just 1px — not 4px or 8px */
}

/* Button press — instant feedback */
.btn:active {
  transform: scale(0.98);       /* Tiny shrink — feels tactile */
  transition-duration: 50ms;    /* Instant on press */
}

/* Link underline reveal */
.link {
  text-decoration: none;
  background-image: linear-gradient(currentColor, currentColor);
  background-size: 0 1px;
  background-position: 0 100%;
  background-repeat: no-repeat;
  transition: background-size var(--duration-normal) var(--ease-out);
}
.link:hover { background-size: 100% 1px; }
```

**Rules (from Apple & Google):**
- Keep ALL UI transitions under 300ms. Animations over 500ms feel sluggish
- Enter transitions are ~30% slower than exits (Apple pattern)
- Never make users wait for an animation to complete before they can act
- Reduced motion: respect `prefers-reduced-motion` — replace animations with instant state changes
- No bounce/spring effects by default. Only use for celebratory moments (achievement, completion)
- No parallax scrolling. It causes motion sickness (Apple HIG)

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
  }
}
```

### Step 12: Apply Iconography

Icons should be **simple, consistent, and match the text weight**.

**Recommended free icon sets (pick ONE per project):**

| Icon Set | Style | Best for | Get it |
|---|---|---|---|
| **Lucide** | Clean, minimal strokes | App UIs, dashboards | [lucide.dev](https://lucide.dev/) |
| **Phosphor** | Flexible, 6 weight variants | Projects needing weight-matching | [phosphoricons.com](https://phosphoricons.com/) |
| **Heroicons** | Tailwind-native, clean | Tailwind CSS projects | [heroicons.com](https://heroicons.com/) |
| **Radix Icons** | Minimal, 15px grid | Radix/shadcn UI projects | [icons.radix-ui.com](https://icons.radix-ui.com/) |
| **Tabler Icons** | Rounded, friendly strokes | Consumer apps | [tabler.io/icons](https://tabler.io/icons) |

**Icon rules:**
- Size: 16px for inline text, 20px for buttons, 24px for standalone/nav
- Stroke width should match your font weight: thin fonts = 1.5px stroke, medium = 2px
- Color: inherit from text color. Icons follow the same color as adjacent text
- Don't mix icon sets. Pick ONE and use it everywhere
- Don't use colored icons in lists/navs. Gray only (same as text)
- Accent color icons: only on the primary CTA or active nav item
- Always pair an icon with a visible label in navigation. Icon-only buttons need tooltips
- Don't use emoji as icons in professional UIs (emoji for content/personality is fine)

### Step 13: Handle Loading & Empty States

Modern apps NEVER show a blank white screen or a generic spinner.

**Skeleton loading (preferred over spinners):**
```css
.skeleton {
  background: linear-gradient(
    90deg,
    var(--bg-subtle) 25%,
    var(--bg-hover) 50%,
    var(--bg-subtle) 75%
  );
  background-size: 200% 100%;
  animation: skeleton-shimmer 1.5s ease-in-out infinite;
  border-radius: var(--radius-sm);
}

@keyframes skeleton-shimmer {
  0% { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}

/* Skeleton shapes */
.skeleton-text {
  height: 14px;
  width: 80%;          /* Vary width for realism: 80%, 60%, 90% */
  margin-bottom: 8px;
}
.skeleton-heading {
  height: 20px;
  width: 50%;
  margin-bottom: 12px;
}
.skeleton-avatar {
  width: 40px;
  height: 40px;
  border-radius: 9999px;
}
.skeleton-card {
  height: 120px;
  width: 100%;
}
```

**When to use what:**
- **Skeleton screens**: for initial page load, list items loading, card grids
- **Inline spinner** (tiny, 16px): for button actions (save, submit) — show INSIDE the button
- **Progress bar**: for uploads, multi-step processes with known duration
- **NEVER**: full-page spinner overlay, spinning logo, "Loading..." text alone

**Button loading state:**
```css
.btn-loading {
  pointer-events: none;
  opacity: 0.7;
  position: relative;
}
.btn-loading::after {
  content: '';
  width: 14px;
  height: 14px;
  border: 2px solid transparent;
  border-top-color: currentColor;
  border-radius: 50%;
  animation: spin 0.6s linear infinite;
  margin-left: 8px;
  display: inline-block;
  vertical-align: middle;
}
@keyframes spin {
  to { transform: rotate(360deg); }
}
```

**Empty states (Apple HIG: "Provide clear next steps on any blank screens"):**
```css
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 48px 24px;
  text-align: center;
  min-height: 200px;
}
.empty-state-icon {
  font-size: 40px;               /* Icon or illustration, muted */
  color: var(--text-tertiary);
  margin-bottom: 16px;
}
.empty-state-title {
  font-size: 16px;
  font-weight: 500;
  color: var(--text-primary);
  margin-bottom: 4px;
}
.empty-state-description {
  font-size: 14px;
  color: var(--text-secondary);
  max-width: 320px;
  margin-bottom: 16px;
  line-height: 1.5;
}
```

**Empty state content formula:**
- Heading: acknowledge the emptiness briefly — "No projects yet"
- Description: tell them what to do — "Create your first project to get started"
- CTA button: the primary action — "Create project" (accent, compact)
- Optional: subtle illustration or icon (muted gray, not giant)
- NEVER: blame the user, use "Oops!", or leave the screen totally blank

### Step 14: Accessibility Essentials

Accessibility is not optional — it's how 15%+ of users navigate.
Apple, Microsoft, and Google all treat this as a core design requirement.

**Color contrast (WCAG 2.1 AA minimum):**
- Normal text (under 18px): **4.5:1** contrast ratio minimum
- Large text (18px+ bold or 24px+ regular): **3:1** minimum
- UI components and graphical objects: **3:1** minimum
- Our color system already passes: `#3C3C3C` on `#FFFFFF` = 10.3:1 ✓
- `#787878` on `#FFFFFF` = 4.6:1 ✓ (barely passes — don't go lighter for text)
- `#A0A0A0` on `#FFFFFF` = 2.9:1 ✗ — only for decorative/placeholder text, never for essential info

**Focus indicators (keyboard navigation):**
```css
/* Visible focus ring — MUST be present on all interactive elements */
:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
  border-radius: var(--radius-sm);
}

/* Remove ONLY the mouse-click focus ring, keep keyboard */
:focus:not(:focus-visible) {
  outline: none;
}
```

**Rules:**
- NEVER remove focus outlines globally (`*:focus { outline: none }` is an anti-pattern)
- Use `:focus-visible` so focus rings only show for keyboard users
- Focus rings must have 3:1 contrast against the background
- Tab order must follow visual order — don't rearrange with `tabindex` values > 0

**Touch targets (Apple HIG + Material Design):**
- Minimum touch target: **44x44px** (Apple) / **48x48px** (Google)
- Even if the visible element is smaller, the tap area must be at least 44px
- Spacing between touch targets: at least **8px** to prevent mis-taps

**Reduced motion:**
- Always include `@media (prefers-reduced-motion: reduce)` (see Step 11)
- Replace animations with instant changes, not just removing them

**Text:**
- Don't convey meaning through color alone — add icons, text labels, or patterns
- Ensure all images have `alt` text (empty `alt=""` for decorative images)
- Use semantic HTML: `<button>` not `<div onclick>`, `<nav>` not `<div class="nav">`
- Form inputs must have associated `<label>` elements

## Platform-Specific Details

Read the relevant reference file only when needed:
- `references/web.md` — CSS architecture, responsive, SPA patterns
- `references/mobile.md` — Touch targets, iOS/Android specifics
- `references/desktop.md` — Multi-panel layouts, keyboard shortcuts
- `references/notifications.md` — Toasts, push, email, banners
- `references/components.md` — Detailed component specs

## Final Checklist (Before Saying "Done")

After applying changes, verify EVERY point. If ANY fails, go back and fix it.

1. **Squint test**: Squint at the screen. Is it mostly white/light gray with tiny color touches? If large colored blocks are still visible → fix them.
2. **Category label check**: Are any category/type labels (like "EXERCISE", "WARMUP", "STATUS") colored (orange, blue, red, green)? → Change to gray: `color: #787878; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.06em;`
3. **Background tint check**: Are any text sections, description blocks, or info rows using yellow, beige, cream, light blue, or any non-white background? → Change to `#FFFFFF` or `#F5F5F4` or `transparent`.
4. **Button size check**: Are any buttons full-width, taller than 44px, or using font-weight > 500? Are there multiple accent colors (blue AND orange buttons)? → Reduce size, use one accent color, make non-primary buttons ghost/outlined.
5. **Number/metric check**: Are display numbers larger than 32px, bolder than weight 600, or colored (blue, orange)? → Reduce to 28px, weight 600, color #1C1C1C.
6. **Border audit**: Are any borders thicker than 1px or colored (not gray)? → Fix to 1px #E8E8E8 or remove.
7. **Accent budget check**: Count accent-colored elements on screen. More than 2-3? → Reduce. Only the primary CTA button and maybe one progress bar / active indicator.
8. **Spacing check**: Do all sections have 24px+ gap between them? → Add more space.
9. **Border-radius consistency**: Is the same radius value used everywhere? → Standardize to one value (6px or 10px).
10. **Font weight audit**: Any body text using 600+? Any element using 700, 800, 900, or `bold`? → Reduce. Max 600 for page titles only.
11. **Capitalization consistency check**: Are headings, buttons, labels, and titles using sentence case consistently? Are any using Title Case or ALL CAPS where they shouldn't be? → Fix to sentence case. Only category labels/tags and short badges should be UPPERCASE.
12. **Text structure check**: Are button labels action-verb-first and 1-3 words? Are error messages specific and non-blaming? Are headings short (3-8 words) with no trailing periods? → Fix per text formatting rules.
13. **Motion check**: Do all interactive elements (buttons, links, cards) have `transition` declarations? Are any transitions longer than 300ms? Is `prefers-reduced-motion` handled? → Add transitions, reduce durations, add reduced-motion media query.
14. **Icon consistency check**: Are all icons from the same set? Same stroke width? Same size in similar contexts? → Standardize to one icon set.
15. **Loading state check**: Does the app show skeleton loaders or inline spinners during data fetches? Or does it show a blank screen / full-page spinner? → Replace with skeletons. Buttons should show inline spinners during actions.
16. **Empty state check**: When there's no data (empty list, no results, first use), is there a helpful message with a CTA? Or just a blank area? → Add empty state with heading, description, and action button.
17. **Accessibility check**: Do all interactive elements have visible `:focus-visible` styles? Are touch targets at least 44px? Do text colors meet WCAG 4.5:1 contrast? → Fix per accessibility rules.

If any check fails, go back and fix it before presenting the result.

## Post-Deploy Verification

After deploying CSS/UI changes, ALWAYS test the app's core functionality:
1. Load the page — verify it renders correctly
2. Test the primary user flow (upload, submit, navigation) — ensure no API errors
3. Check the browser console for errors
4. If the app has an API backend, verify API calls return 200 (not 403/404/500)
