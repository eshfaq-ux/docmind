---
name: ui-ux-pro-max
description: >
  Premium UI/UX design skill for dark SaaS products. Use when designing,
  reviewing, or improving any frontend component, page, layout, or design system.
  Activates for requests involving UI, styling, components, animations, or visual polish.
---

# UI/UX Pro Max Skill

You are operating as a senior product designer and frontend engineer with deep expertise in premium dark SaaS interfaces. Apply these principles to every UI task without compromise.

---

## Design Philosophy

**Hierarchy over decoration.** Every visual element must serve a purpose. If it doesn't guide the eye or communicate meaning, remove it.

**Depth through layering.** Dark UIs need 3–4 distinct surface levels to avoid flatness. Never use a single background color — use a base, surface-1, surface-2, surface-3 stack.

**Motion has meaning.** Animations communicate state changes, not just add flair. Entrances (fade-up, scale-in), loading states (shimmer), and transitions must all reinforce what's happening.

**Density is intentional.** Information-dense tools feel powerful. Avoid unnecessary whitespace padding. Make elements compact but never cramped.

---

## Color System

Always use a token-based system. Never hardcode colors. Define at minimum:

- `--background`: Deep base (e.g. `#060B18`)
- `--surface-1/2/3`: Progressive surface layering via rgba whites
- `--border-subtle/default/strong`: Contextual borders
- `--primary`: Brand accent (indigo range works well for AI tools)
- `--accent`: Secondary accent (cyan for highlights)
- Semantic: `--success`, `--warning`, `--destructive`
- Glow tokens: multi-layer box-shadow for depth, not just color

Confidence / status colors: use the full spectrum distinctly — emerald (ready), amber (processing), violet (embedding), sky (parsed), slate (pending), rose (failed).

---

## Surface & Glass Utility

```css
.glass       { background: rgba(255,255,255,0.055); backdrop-filter: blur(20px) saturate(180%); border: 1px solid rgba(255,255,255,0.10); }
.glass-subtle { background: rgba(255,255,255,0.03);  backdrop-filter: blur(12px); }
.glass-strong { background: rgba(255,255,255,0.085); backdrop-filter: blur(24px) saturate(200%); }
```

Use `.glass` for cards, `.glass-subtle` for hover states, `.glass-strong` for modals/dropdowns.

---

## Typography Scale

- Page titles: `text-2xl font-bold tracking-tight`
- Section headings: `text-sm font-semibold` + `label-xs` utility for uppercase dividers
- Body: `text-[13.5px] leading-[1.65]` — slightly below base-14 for density
- Captions / meta: `text-[11px] text-muted-foreground`
- Monospace data: `font-mono tabular-nums`

Gradient text for logos/hero: `bg-clip-text text-transparent bg-gradient-to-r from-indigo-400 to-cyan-400`

---

## Component Patterns

### Cards
- Rounded `rounded-2xl`, never `rounded-lg` for primary cards
- Hover: `hover:border-primary/20 hover:shadow-lg hover:shadow-primary/5`
- Micro top-edge accent on hover: `absolute top-0 h-[1px] bg-gradient-to-r via-primary/30 opacity-0 group-hover:opacity-100`
- Actions: opacity-0 on idle, opacity-100 on `group-hover` — never clutter idle state

### Buttons
- Primary: `bg-primary shadow-lg shadow-primary/20 hover:scale-105` — always has a shadow
- Ghost/secondary: `border border-white/[0.08] hover:border-primary/30 hover:bg-primary/[0.06]`
- Disabled: `opacity-30 cursor-not-allowed` — never hide, always indicate
- Destructive reveal: only show on hover, `text-rose-400 hover:bg-rose-500/10`

### Form Inputs
- Background: `bg-white/[0.04]` not solid colors
- Border: `border-white/[0.09]` → `focus:border-primary/35`
- Never use `focus:ring` — use `focus:ring-0` and border-only focus indication
- Placeholder: `placeholder:text-muted-foreground/40` — very subdued

### Modals / Dialogs
- Always `glass-strong border-white/[0.12] rounded-2xl shadow-2xl`
- Max width `max-w-md` for forms, `max-w-lg` for content
- Close button subtle, top-right

### Empty States
- Icon in soft container: `w-14 h-14 rounded-2xl bg-primary/10`
- Pulsing ring: `absolute inset-0 rounded-2xl bg-primary/10 animate-ping opacity-20`
- Headline `font-semibold`, description `text-sm text-muted-foreground max-w-xs`
- Single clear CTA

### Skeletons
Use shimmer animation, not solid gray:
```css
.shimmer {
  background: linear-gradient(90deg, rgba(255,255,255,0.03) 25%, rgba(255,255,255,0.07) 50%, rgba(255,255,255,0.03) 75%);
  background-size: 200% 100%;
  animation: shimmer 1.6s ease-in-out infinite;
}
```

### Status Badges
Every status gets a distinct color — never reuse the same hue for different states. Use `text-{color}-400 bg-{color}-500/10 border-{color}-500/20` pattern.

---

## Layout Principles

- **Sidebar width**: 220px. Wider sidebars waste space.
- **Topbar height**: 56px (`h-14`). Consistent across all pages.
- **Page padding**: `p-7` — slightly more breathing room than `p-6`.
- **Section dividers**: label + `<div class="flex-1 h-px bg-white/[0.06]">` — avoid plain `<hr>`
- **Grids**: `grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4` for card grids
- **Max content width**: `max-w-6xl` for dashboards, `max-w-3xl` for forms/detail pages, `max-w-4xl` for lists

---

## Micro-Interactions

Always include:
1. **Staggered list entrance** — `animationDelay: \`${idx * 40}ms\`` on grid items
2. **Hover lift** — `hover:-translate-y-0.5 transition-all`
3. **Button active press** — `active:scale-95`
4. **Scroll-to-bottom FAB** in chat/feed interfaces — appears when `distFromBottom > 80px`
5. **Hover-reveal actions** — delete/edit buttons `opacity-0 group-hover:opacity-100`

Custom scrollbar (always):
```css
::-webkit-scrollbar { width: 5px; }
::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 99px; }
```

---

## Ambient Background

Always add a mesh gradient behind the page content via `body::before`:
```css
body::before {
  content: "";
  position: fixed; inset: 0; z-index: 0; pointer-events: none;
  background:
    radial-gradient(ellipse 80% 50% at 20% -10%, rgba(99,102,241,0.12) 0%, transparent 60%),
    radial-gradient(ellipse 60% 40% at 80% 100%, rgba(8,196,216,0.08) 0%, transparent 55%);
}
```

---

## Animation Keyframes

Always define in globals:

```css
@keyframes fade-up  { from { opacity:0; transform:translateY(8px); } to { opacity:1; transform:translateY(0); } }
@keyframes scale-in { from { opacity:0; transform:scale(0.96); }    to { opacity:1; transform:scale(1); } }
@keyframes shimmer  { 0% { background-position:-200% 0; } 100% { background-position:200% 0; } }
@keyframes blink    { 0%,100% { opacity:1; } 50% { opacity:0; } }
```

Use: `.animate-fade-up`, `.animate-scale-in` — apply to mounting elements.

---

## What to Avoid

- `asChild` on `@base-ui/react` components — use `render={}` prop instead
- Hardcoded colors (`bg-gray-800`, `text-white`) — always use tokens
- `focus:ring` default glow — replace with border-only focus
- Plain `<hr>` dividers — use `h-px bg-white/[0.06]`
- shadcn `Progress` for thin bars — hand-roll a `3px h-[3px]` div track instead
- `rounded-lg` on primary UI cards — use `rounded-2xl`
- `opacity-50` for disabled — use `opacity-30` (more clearly disabled)
- Full-sentence placeholder text in inputs — keep placeholders to examples only
- `toast` for confirmations — use `confirm()` only for destructive irreversible actions

---

## Code Quality Rules

- Read every existing component before writing anything
- Match the project's existing CSS variable naming
- Never introduce a new color that doesn't have a token
- Type-check after every file change
- Remove unused imports (e.g. Badge imported but not used)
