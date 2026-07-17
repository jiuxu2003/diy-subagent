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
