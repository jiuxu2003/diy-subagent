# Component Guidelines

> React component, form, styling, and accessibility conventions.

---

## Component Responsibilities

- Components render typed view models and emit semantic user intents.
- Data loading and mutation orchestration live in feature hooks.
- Native file parsing, rendering, path resolution, and writes stay in Rust.
- A component must represent loading, empty, invalid, conflict, success, and
  recoverable-error states when the workflow can produce them.
- Prefer composition over platform-specific component duplication.

Use function components with explicit props. Do not use `React.FC` when it
would add an implicit `children` contract.

```tsx
type AgentFilePreviewProps = {
  preview: AgentWritePreview;
  onConfirm: () => void;
  onCancel: () => void;
  isSubmitting: boolean;
};

export function AgentFilePreview({
  preview,
  onConfirm,
  onCancel,
  isSubmitting,
}: AgentFilePreviewProps) {
  return (
    <section aria-labelledby=\"agent-preview-heading\">
      <h2 id=\"agent-preview-heading\">Review native file changes</h2>
      <DiffViewer diff={preview.diff} />
      <Button onClick={onConfirm} disabled={isSubmitting}>
        Apply changes
      </Button>
      <Button variant=\"secondary\" onClick={onCancel}>
        Cancel
      </Button>
    </section>
  );
}
```

---

## Props and Composition

- Define props next to the component unless shared by multiple owners.
- Use discriminated unions for mutually exclusive component modes.
- Pass event callbacks such as `onConfirm`, not service objects or raw setters.
- Avoid boolean combinations that create impossible states; use a `status` or
  union variant.
- Keep platform-specific fields in a dedicated `PlatformFieldSet` selected by
  an exhaustive switch.
- Do not pass raw IPC DTOs through the whole tree; map them once to view models
  when presentation needs differ.
- Shared UI primitives accept accessible semantic props and visual variants,
  not product-specific platform logic.

---

## Forms

- Use a Zod schema as the runtime validation owner for user-editable drafts.
- Display canonical field labels and the corresponding native field name when
  they differ.
- Preserve unsupported/unknown native fields but render them read-only until an
  adapter explicitly supports editing them.
- Show adapter portability issues next to the affected field and distinguish
  unsupported, lossy, and platform-native-only semantics.
- Validation must run before preview; preview must run before commit.
- Dirty state is derived from the draft and source revision, not manually
  toggled in unrelated event handlers.
- Destructive actions require explicit confirmation and explain backup/recovery.

---

## Styling

- Use Tailwind CSS and shadcn/ui/Radix primitives as the default component
  system.
- Use design tokens and variants; do not scatter literal colors and spacing.
- Keep macOS platform behavior separate from decorative imitation. Prefer
  native-feeling spacing, keyboard behavior, and menus over fake window chrome.
- Support light and dark appearance from the first component.
- Avoid layout that depends on English string length.

### Convention: macOS-native visual system (established 2026-07 beauty-ui)

**What**: The app follows a macOS-native tool aesthetic (TablePlus/Things-like).
All values below are contracts, not suggestions:

- **Color**: every color goes through a `var(--*)` token defined in
  `src/styles/globals.css` (`:root` + `.dark`). Accent is macOS system blue
  (`--accent`: `#007aff` light / `#0a84ff` dark). Surfaces are neutral gray —
  never blue-tinted grays, never gradients.
- **Type scale**: redefined in the Tailwind `@theme` block — `text-xs` 12px,
  `text-sm`/`text-base` 14px (body baseline), `text-lg` 16px, `text-xl` 18px,
  `text-2xl` 21px (page titles), `text-3xl` 25px (max). `text-4xl+` is
  forbidden. Page header = `text-2xl font-semibold tracking-tight` plus at most
  one muted explainer line. (13px baseline was rejected as too small in user
  review, 2026-07.)
- **Fonts**: UI text uses the system stack (SF Pro + PingFang — never replace
  it). Data (paths, logical names, ids, diffs) uses `font-mono` = IBM Plex
  Mono, bundled offline via `@fontsource/ibm-plex-mono` imports in `main.tsx`.
- **Brand color**: `--brand` (`#6c74f6` light / `#7a82ff` dark) is identity
  only — sidebar `BrandMark`, empty-state line art, install-success check
  square. Never on buttons, selection, focus, or status; functional accent
  stays system blue.
- **Radii**: `rounded-md` (6px) for controls, `rounded-lg` (8px) for grouped
  list containers, `rounded-xl` (12px) for dialogs. `rounded-2xl`/`rounded-3xl`
  are forbidden.
- **Shadows**: none except dialog elevation (`shadow-2xl` on Radix content) and
  the near-none `--shadow-card`. Structure comes from hairline borders
  (`--border`), not depth.
- **Lists over cards**: repeated records render as hairline-divided rows
  (`divide-y divide-[var(--border)]` inside one `rounded-lg border` container),
  not as a grid of nested cards. The `Card` and `Badge` primitives were
  deleted on purpose — do not reintroduce them.
- **Status semantics**: use `components/ui/StatusDot` (6px tone dot + required
  11px text, color never the only signal) or plain muted text — never pill
  badges.
- **Monospace for data**: paths, logical names, operation ids, and diffs always
  use `font-mono`. Code/diff panels follow the theme via `--code-bg` /
  `--code-text` (`#f6f6f8`/`#403f53` light, `#161618`/`#e5e5e5` dark); the
  unified-diff panel tints `+`/`-` lines with success/danger soft tokens. Full
  syntax highlighting is deliberately out of scope (offline, no tokenizer).

**Why**: the previous UI read as AI-generated (nested cards, pill overload,
marketing eyebrows, purple-blue accent) and was explicitly rejected by the
product owner.

```tsx
// Good: hairline row list with StatusDot
<ul className="divide-y divide-[var(--border)] rounded-lg border border-[var(--border)] bg-[var(--surface)]">
  <li className="flex items-center gap-4 px-4 py-3.5">
    <h2 className="text-sm font-semibold">{name}</h2>
    <StatusDot tone="success">只读</StatusDot>
  </li>
</ul>

// Bad: nested card + pill badge + oversized title (deleted pattern)
<Card className="rounded-2xl p-6 shadow-lg">
  <h1 className="text-4xl font-bold">从一个真正有边界的专家开始</h1>
  <Badge tone="success">默认只读</Badge>
</Card>
```

### Convention: user-facing copy tone

**What**: UI strings are plain Simplified-Chinese product language. Forbidden
in user-visible copy: internal spec jargon (`WritePlan`, `token`, `可补偿批次`,
`revision`, `磁盘事实来源`), marketing eyebrows/slogans, and trust-signal cards
("离线且确定性", "不调用 LLM"). Describe what happens for the user instead
(e.g. 「写入前自动备份，失败自动回滚。」).

**Why**: leaking implementation vocabulary into the UI is the fastest way back
to demo-feel; guarantees belong in behavior, not banners.

### Convention: frameless window drag regions

**What**: the window uses `titleBarStyle: "Overlay"` + `hiddenTitle`
(tauri.conf.json). Draggability comes from two `data-tauri-drag-region`
elements in `App.tsx`: a fixed full-width `h-7` top strip and the sidebar's
`h-11` traffic-light spacer. Drag regions must never contain interactive
children, and page content must start below the top strip.

**Why**: removing either region makes the frameless window undraggable;
interactive elements inside a drag region become unclickable. The attributes
are inert in plain-web Playwright runs.

---

## Accessibility

- All actions are keyboard reachable and have a visible focus state.
- Icon-only buttons require an accessible name.
- Validation errors connect to fields with `aria-describedby`.
- Modal dialogs trap focus, restore focus, and support Escape where safe.
- Async operations announce status without repeatedly stealing focus.
- Color is never the only indicator for platform, validation, or diff state.
- Reduced motion and sufficient contrast are mandatory.

---

## Common Mistakes

- Calling Tauri `invoke` inside a component.
- Hiding platform differences behind untyped dictionaries.
- Saving directly from the editor without a native-file preview.
- Hiding a lossy cross-platform conversion behind a generic success message.
- Rendering a parser error string verbatim instead of using the typed error
  code and field information.
- Making the entire agent editor platform-specific instead of isolating only
  the differing fields.
- Using snapshots as the only assertion for security- or data-loss-sensitive UI.
- Reintroducing deleted patterns: pill badges, nested `Card` grids,
  `rounded-2xl+`, gradients, or marketing copy (see Styling conventions).
- Placing interactive elements inside a `data-tauri-drag-region` element, or
  breaking one of the protected test-anchor strings (nav labels, 「保存个人模板」,
  「在 Finder 中显示恢复目录」, platform labels) without updating the tests in
  the same change.
