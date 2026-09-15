import { type ReactNode } from 'react';

import type { Settings } from '@/types/domain';

import { SettingsContext } from './app-context';

export function SettingsProvider({ value, children }: { value: Settings; children: ReactNode }) {
  return <SettingsContext value={value}>{children}</SettingsContext>;
}
