import { Circle } from 'lucide-react';

import { ICONS } from './category-icons';

export function CategoryIcon({ name, className }: { name: string; className?: string }) {
  // A custom category can name an icon this build does not ship, and an import
  // that resolves to undefined would throw inside the render of a feed row.
  const Icon = ICONS[name] ?? Circle;
  return <Icon className={className} aria-hidden="true" />;
}
