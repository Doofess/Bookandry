import { cn } from 'cn';
import { useTranslation } from 'react-i18next';
import { Navigate, NavLink, Outlet, useLocation } from 'react-router-dom';

import { ScreenHead } from '@/app/screen-head';
import { useDesktop } from '@/app/use-desktop';
import { Sheet } from '@/components/ui/sheet-surface';

import { useSettingsSections } from './sections';
import { SettingsScreen } from './settings-screen';

/** A subject as a text pill: 48px, the current one filled with ink and set in 600 (the rail's look). */
const SUBJECT_PILL = cn(
  'flex min-h-12 items-center rounded-full px-4.5 text-[1.0625rem]',
  'transition-[background-color,color] duration-(--dur-press) ease-fill hover-fine:bg-accent',
  'focus-visible:outline-3 focus-visible:outline-offset-3 focus-visible:outline-ring',
  'aria-[current=page]:bg-press aria-[current=page]:font-semibold aria-[current=page]:text-on-press',
);

/**
 * Settings in two panes from the board width (§5.7): the subjects on a paper
 * sheet beside the open one. On a phone it is only the open page - the list
 * is `/settings` itself, and a subject keeps its way back.
 */
export function SettingsLayout() {
  const { t } = useTranslation();
  const desktop = useDesktop();
  const sections = useSettingsSections();
  if (!desktop) return <Outlet />;

  const subjects = [...sections.account, ...sections.app];
  return (
    <section className="px-3 pb-8 lg:px-0">
      <ScreenHead title={t('settings.title')} />
      <div className="grid grid-cols-1 gap-sheet @board/main:grid-cols-12 @board/main:items-start">
        <Sheet kind="paper" as="div" data-slot="settings-subjects" className="@board/main:col-span-4">
          <nav aria-label={t('settings.title')} className="grid gap-1">
            {subjects.map(({ key, to, label }) => (
              <NavLink key={key} to={to} className={SUBJECT_PILL}>
                {label}
              </NavLink>
            ))}
          </nav>
        </Sheet>
        <div data-slot="settings-subject" className="min-w-0 @board/main:col-span-8">
          <Outlet />
        </div>
      </div>
    </section>
  );
}

/**
 * `/settings` itself: on a desktop it is the first subject (the account's
 * when signed in), replacing the address so Back does not loop; on a phone
 * it is the list.
 */
export function SettingsIndex() {
  const desktop = useDesktop();
  const sections = useSettingsSections();
  const { search } = useLocation();
  if (!desktop) return <SettingsScreen />;
  const first = sections.account[0] ?? sections.app[0];
  if (first === undefined) return null;
  return <Navigate replace to={{ pathname: first.to, search }} />;
}
