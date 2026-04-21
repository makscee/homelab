# hub-standards ui-kit

Shared UI primitives + design tokens consumed by every frontend in `workspace/` (animaya, voidnet, homelab apps/admin, etc.). Locked source of truth alongside `ui-style-spec.md` and `frontend-stack-spec.md`.

## Usage

Import primitives directly by relative path or via a consumer-local TS path alias:

```ts
// With a TS path alias (e.g. tsconfig.json paths: "@ui-kit/*": ["../../../knowledge/standards/ui-kit/*"])
import { Button } from "@ui-kit/primitives";

// Without an alias — raw relative path
import { Button } from "../../../knowledge/standards/ui-kit/primitives/button";
```

No build step. No package publish. Consumers import `.tsx` source directly and Vite/Next/tsc handle transpilation.

## Tokens

Each consumer's `app/globals.css` must import tokens **before** the `tailwindcss` entry so Tailwind v4 reads `@theme` before compiling layers:

```css
@import "../../../knowledge/standards/ui-kit/tokens/tokens.css";
@import "tailwindcss";
```

`tokens.css` contains:
- `@custom-variant dark`
- `@theme { … }` color + radius token mappings
- `:root { --background … --radius }` shadcn slate variables (dark-as-default per D-12-21)
- Tailwind v4 border-compat `@layer base` rule
- Global `* { @apply border-border }` + body background/foreground

## No versioning, no build step

Per **D-22-05**, ui-kit is shared **source** — not a published package. There is no semver, no changelog, no package.json. Breakage risk is managed by each consumer's test suite. If you make a breaking change to a primitive, search consumers (`rg "from.*ui-kit/primitives"`) and update them in the same commit.

## Layout

```
ui-kit/
├── tokens/        # Global CSS + @theme tokens (import once in consumer globals.css)
├── primitives/    # Leaf shadcn components (Button, Card, Input, Table, Badge, Dialog, Select, Toaster/sonner)
├── molecules/     # Homelab/animaya-specific composites (future — populated by downstream plans)
└── lib/           # cn() + any pure helpers shared across primitives
```

## Adding a component

- **Leaf primitive** (stateless, from shadcn or equivalent, no domain knowledge) → `primitives/<name>.tsx` and add to `primitives/index.ts` barrel.
- **Composite** (uses multiple primitives and carries product-specific layout/behavior) → `molecules/<name>.tsx`. Follow the relative import pattern: primitives via `../primitives`, utils via `../lib/utils`.
- Every primitive MUST import `cn` from `../lib/utils` (not `@/lib/utils`) so the file is consumer-agnostic.
- Match conventions in `ui-style-spec.md` (spacing, radius, typography) — that spec is locked.
