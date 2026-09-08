// Minimal className joiner — the codebase has no clsx/tailwind-merge
// dependency, and every existing component (see components/ui/Button.tsx)
// just template-literal-joins classes, so this matches that convention
// instead of pulling in the shadcn/tailwind-merge stack for one component.
export function cn(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(' ');
}
