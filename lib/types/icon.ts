import type { LucideIcon } from 'lucide-react';

/**
 * Type for a component rendered as an icon (all icon values in this app are
 * lucide-react icons).
 *
 * Use this instead of `React.ElementType` for icon slots. In React 19's types
 * `ElementType` is a union wide enough that resolving JSX props against it
 * collapses them to `never`, so `<Icon className="..." />` fails to compile with
 * "Type 'string' is not assignable to type 'never'".
 */
export type IconComponent = LucideIcon;
