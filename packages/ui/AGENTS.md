# UI Components

## Overview

Shared React component library built on Base UI primitives and styled with Tailwind CSS 4. Provides consistent components across workspaces with variant-based styling via class-variance-authority.

## Key files

| File                       | Owns                                             |
| -------------------------- | ------------------------------------------------ |
| src/lib/utils.ts           | cn utility (clsx + tailwind-merge)               |
| src/components/button.tsx  | Base UI Button with CVA variants                 |
| src/components/tabs.tsx    | Base UI Tabs with custom styling                |
| src/components/input.tsx   | Styled input with label support                  |
| src/components/card.tsx    | Card layout primitives                           |
| src/components/sonner.tsx  | Toast notifications via Sonner                   |

## Conventions

- Base UI React primitives for behavior, Tailwind for styling
- CVA for variant definitions (variant, size props)
- cn utility for merging Tailwind classes with user overrides
- Component anatomy: ButtonPrimitive wrapped with cn(buttonVariants({...}))
- Dark mode via CSS variables, no class-based theme switching in components
- Icon sizing via [&_svg] selectors, default size-4 unless overridden
- data-slot attributes for downstream composition

## Gotchas

- Base UI uses `data-*` attributes for state, not `:hover` pseudo-classes
- Focus visible styles via `focus-visible:` prefix, not `focus:`
- Disabled state via `disabled:` prefix on Base UI primitives
- CVA variants compose, default variants always applied unless overridden
- Tailwind classes sorted via Biome, cn function whitelisted in config

_Drafted by /audit from the repo, worth a quick human pass. Edit freely: once a line stops matching this draft, later runs treat it as curated and will flag rather than overwrite it._
