import { Dialog as DialogPrimitive } from '@base-ui/react/dialog';
import { cn } from 'cn';
import { XIcon } from 'lucide-react';
import type * as React from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';

/**
 * An editor (§6.1): ONE Base UI dialog popup with responsive classes.
 *
 * Below lg it is today's bottom sheet. From lg it is a 480px panel at the
 * inline end - on the right in English, the left in Hebrew - floating on the
 * scrim, inset by the sheet gap from the window's edges. One popup, not two
 * behind breakpoints, so a window resized across lg with a half-filled form
 * keeps everything.
 *
 * It stays modal: focus is trapped, Escape closes the top one only, and focus
 * returns to the opener. Inside: a header with the title pair and a round ×,
 * a body that scrolls without dragging the page, and the editor's own
 * Cancel and Save (marked `data-slot="editor-actions"`) held at its foot.
 */
function EditorPanel(props: DialogPrimitive.Root.Props) {
  return <DialogPrimitive.Root {...props} />;
}

const PANEL = [
  // Below lg: the bottom sheet.
  'fixed start-0 end-0 inset-be-0 z-50 flex max-h-[92dvh] flex-col overflow-y-auto overscroll-contain',
  'rounded-t-sheet border-2 border-transparent bg-card text-card-foreground outline-none @container/panel',
  // An opacity fade for everyone; the rise and the slide only when motion is welcome (§8.2).
  'transition-[opacity,translate] duration-(--dur-panel) ease-out data-starting-style:opacity-0 data-ending-style:opacity-0',
  'motion-safe:data-starting-style:translate-y-8 motion-safe:data-ending-style:translate-y-8',
  // From lg: a sheet floating at the inline end.
  'lg:inset-bs-sheet lg:inset-be-sheet lg:start-auto lg:end-sheet lg:max-h-none lg:w-120 lg:rounded-sheet',
  'lg:motion-safe:data-starting-style:translate-y-0 lg:motion-safe:data-ending-style:translate-y-0',
  'lg:motion-safe:data-starting-style:translate-x-8 lg:motion-safe:data-ending-style:translate-x-8',
  'lg:motion-safe:rtl:data-starting-style:-translate-x-8 lg:motion-safe:rtl:data-ending-style:-translate-x-8',
  // The editor's own Cancel and Save stay put at the foot, side by side at the inline end from lg.
  '[&_[data-slot=editor-actions]]:sticky [&_[data-slot=editor-actions]]:inset-be-0 [&_[data-slot=editor-actions]]:z-10',
  '[&_[data-slot=editor-actions]]:bg-card [&_[data-slot=editor-actions]]:py-3',
  'lg:[&_[data-slot=editor-actions]]:justify-end lg:[&_[data-slot=editor-actions]>*]:flex-none lg:[&_[data-slot=editor-actions]>*]:min-w-37.5',
].join(' ');

function EditorPanelContent({ className, children, ...props }: DialogPrimitive.Popup.Props) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Backdrop
        data-slot="editor-panel-scrim"
        className="fixed inset-0 z-50 bg-scrim transition-opacity duration-(--dur-panel) data-ending-style:opacity-0 data-starting-style:opacity-0"
      />
      <DialogPrimitive.Popup data-slot="editor-panel" className={cn(PANEL, className)} {...props}>
        {children}
      </DialogPrimitive.Popup>
    </DialogPrimitive.Portal>
  );
}

/** The title pair and the round ×. Sticky, so the way out is always in reach. */
function EditorPanelHeader({ className, children, ...props }: React.ComponentProps<'div'>) {
  const { t } = useTranslation();
  return (
    <div
      data-slot="editor-panel-header"
      className={cn(
        'sticky inset-bs-0 z-10 flex items-start gap-3 bg-card px-5 pt-5 pb-4 lg:px-7 lg:pt-7',
        className,
      )}
      {...props}
    >
      <div className="flex min-w-0 flex-1 flex-col gap-1">{children}</div>
      <DialogPrimitive.Close render={<Button variant="round" />}>
        <XIcon aria-hidden="true" />
        <span className="sr-only">{t('action.close')}</span>
      </DialogPrimitive.Close>
    </div>
  );
}

function EditorPanelTitle({ className, ...props }: DialogPrimitive.Title.Props) {
  return (
    <DialogPrimitive.Title
      data-slot="editor-panel-title"
      className={cn(
        'text-(length:--text-title-sheet) leading-[1.02] font-semibold tracking-[-0.01em]',
        className,
      )}
      {...props}
    />
  );
}

function EditorPanelDescription({ className, ...props }: DialogPrimitive.Description.Props) {
  return (
    <DialogPrimitive.Description
      data-slot="editor-panel-description"
      className={cn('text-(length:--text-sub-sheet) leading-[1.15] font-light', className)}
      {...props}
    />
  );
}

/** The editor's fields, on the header's inline padding (20 / 28px), 16px apart. */
function EditorPanelBody({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="editor-panel-body"
      className={cn('flex flex-col gap-4 px-5 pb-6 lg:px-7', className)}
      {...props}
    />
  );
}

/** Cancel (a pill) and Save (the solid pill), held at the panel's foot; side by side at the inline end from lg. */
function EditorPanelActions({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div data-slot="editor-actions" className={cn('flex gap-2 pt-1 [&>*]:flex-1', className)} {...props} />
  );
}

const EditorPanelClose = DialogPrimitive.Close;

export {
  EditorPanel,
  EditorPanelActions,
  EditorPanelBody,
  EditorPanelClose,
  EditorPanelContent,
  EditorPanelDescription,
  EditorPanelHeader,
  EditorPanelTitle,
};
