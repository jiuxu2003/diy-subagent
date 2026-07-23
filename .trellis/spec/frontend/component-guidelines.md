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

### Convention: CC-Switch visual system (established 2026-07-22 ccswitch-style-ui; supersedes the 2026-07 macOS-native system)

**What**: The app follows the CC-Switch aesthetic (farion1231/cc-switch): top-bar
driven shell, spacious single-column flat cards, soft pills. Quantified baseline
lives in `.trellis/tasks/07-22-ccswitch-style-ui/research/cc-switch-style.md`.
All values below are contracts, not suggestions:

- **Color**: every color goes through a `var(--*)` token defined in
  `src/styles/globals.css` (`:root` + `.dark`). Accent is macOS system blue
  (`--accent`: `#007aff` light / `#0a84ff` dark). Surfaces are neutral gray —
  never blue-tinted grays, never gradients. No orange (CC-Switch's "+" color
  was deliberately not copied).
- **Type scale**: unchanged from 2026-07 — `text-xs` 12px, `text-sm`/`text-base`
  14px (body baseline), `text-lg` 16px, `text-xl` 18px, `text-2xl` 21px (page
  titles), `text-3xl` 25px (max). `text-4xl+` is forbidden. Page header =
  back button (when a sub-page) + `text-2xl font-semibold tracking-tight` over
  a hairline. (13px baseline was rejected as too small in user review, 2026-07.)
- **Fonts**: UI text uses the system stack (SF Pro + PingFang — never replace
  it). Data (paths, logical names, ids, diffs) uses `font-mono` = IBM Plex
  Mono, bundled offline via `@fontsource/ibm-plex-mono` imports in `main.tsx`.
- **Brand color**: `--brand` (`#6c74f6` light / `#7a82ff` dark) is identity
  plus exactly one functional surface: the round top-bar create button
  (`Button variant="brand" size="iconRound"`). Everything else stays identity
  only — `BrandMark`, empty-state line art, install-success check tile. Never
  on selection, focus, links, or status; functional accent stays system blue.
- **Radii**: record cards `rounded-2xl` (16px), inputs/buttons/dialog panels
  `rounded-xl` (12px), icon tiles `rounded-[14px]`, chips and pills
  `rounded-full`. Small inline controls may keep `rounded-lg`/`rounded-md`.
- **Shadows**: cards use `--shadow-card` (layered soft shadow) and raise to
  `--shadow-card-hover` on interactive hover; dialogs keep `shadow-2xl`.
  Borders (`--border`) and shadows work together — a card has both.
- **Flat cards, one record per card**: repeated top-level records render as a
  single-column stack of flat `rounded-2xl` cards (tile + bold name + mono
  path + `Pill` + right-side actions). Card-inside-card nesting remains
  forbidden; hairline `divide-y` rows are still fine for secondary lists
  inside one container (e.g. settings rows, preview facts).
- **Status semantics**: use `components/ui/Pill` (soft tinted background +
  darker text, `rounded-full`, color never the only signal — the label text is
  required). `StatusDot` was deleted 2026-07-22; `Card`/`Badge` primitives
  stay deleted — do not reintroduce any of them.
- **Segmented switching**: exclusive view switches (platform tabs) use
  `components/ui/SegmentedControl` (button group with `aria-pressed`, selected
  segment floats on a raised surface). Preset choices that fill a form use
  rounded-full chip buttons with `aria-pressed` (see `CreatePage`).
- **Monospace for data**: paths, logical names, operation ids, and diffs always
  use `font-mono`. Code/diff panels follow the theme via `--code-bg` /
  `--code-text`; the unified-diff panel tints `+`/`-` lines with
  success/danger soft tokens. Full syntax highlighting is deliberately out of
  scope (offline, no tokenizer).

**Why**: the product owner re-anchored the north star from "macOS native
hairline tool" to CC-Switch's spacious card language (2026-07-22 decision,
after reviewing the shipped hairline UI). The original AI-slop rejections
still stand unchanged: nested cards, marketing eyebrows, trust-signal cards,
and internal jargon in copy remain forbidden — CC-Switch cards are flat
single-purpose data rows, which is why they are acceptable.

```tsx
// Good: flat single-layer record card with Pill status
<article className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-[var(--shadow-card)] transition-shadow hover:shadow-[var(--shadow-card-hover)]">
  <h2 className="font-mono text-lg font-semibold">{name}</h2>
  <Pill tone="success">可导入</Pill>
</article>

// Bad: nested cards + oversized marketing title (deleted pattern)
<Card className="p-6 shadow-lg">
  <h1 className="text-4xl font-bold">从一个真正有边界的专家开始</h1>
  <Card className="mt-4">…</Card>
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
(tauri.conf.json). Draggability comes from three leaf surfaces in `App.tsx`
carrying `data-tauri-drag-region` (updated 2026-07-22 for the top-bar shell):
the fixed full-width `h-7` top strip, the top-bar brand row (its svg needs
`pointer-events-none`), and the top-bar flexible spacer between brand and
controls. Tauri's injected handler matches the attribute via the ancestor
chain (`closest`), so a tagged container makes EVERY descendant — including
buttons — start a window drag on mousedown and lose its click. Never tag a
container that holds interactive children; tag only empty/text leaf surfaces.

> **Warning**: the top-bar interactive cluster (SegmentedControl + icon
> buttons + "+") must keep `relative z-[60]`. The fixed drag strip is `z-50`
> and overlaps the upper ~28px of controls vertically centered in the `h-16`
> bar; without the raised z-index the top half of every top-bar button feeds
> clicks to window dragging.

**Why**: removing either region makes the frameless window undraggable;
interactive elements inside a drag region become unclickable. The attributes
are inert in plain-web Playwright runs.

> **Warning**: drag regions die silently without the right capability. The
> attribute triggers `plugin:window|start_dragging`, and Tauri 2's
> `core:default` / `core:window:default` set does NOT include it — the IPC is
> denied with no visible error unless devtools is open.
> `src-tauri/capabilities/default.json` must grant
> `core:window:allow-start-dragging` (double-click maximize uses
> `allow-internal-toggle-maximize`, which IS in the default set).

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
- Reintroducing deleted patterns: nested card grids, gradients, marketing
  copy, or the deleted `Card`/`Badge`/`StatusDot` primitives (status uses
  `Pill`; see Styling conventions).
- Placing interactive elements inside a `data-tauri-drag-region` element,
  dropping the top-bar cluster's `z-[60]`, or breaking one of the protected
  test-anchor strings without updating the tests in the same change: group
  「平台」, buttons 「新建 Subagent」/「返回」/「刷新」/「设置」, region
  「已安装的 subagent」, heading 「新建 Subagent」/「设置」, group 「预设模板」,
  checkbox 「Codex」, textbox 「模板名称」, buttons 「保存个人模板」/
  「在 Finder 中显示恢复目录」, platform labels.
