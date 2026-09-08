'use client';
import { lazy, Suspense, useState } from 'react';
import { Sparkles, X } from 'lucide-react';
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
const CopilotApp = lazy(() => import('./CopilotApp'));
/** V3 integration entry point. Host must include globals.css and provide /api/copilot adapters. */
export function CopilotWidget({
  enabled = true,
  locale = 'fr',
}: {
  enabled?: boolean;
  locale?: 'fr' | 'en';
}) {
  const [open, setOpen] = useState(false);
  if (!enabled) return null;
  return (
    <>
      <button
        className="copilot-launcher"
        aria-label={locale === 'fr' ? 'Ouvrir Cly' : 'Open Cly'}
        onClick={() => setOpen(true)}
      >
        <Sparkles size={20} />
        Cly
      </button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent className="widget-sheet" showCloseButton={false}>
          <div className="sheet-heading">
            <SheetTitle>Cly</SheetTitle>
            <button
              aria-label={locale === 'fr' ? 'Fermer' : 'Close'}
              onClick={() => setOpen(false)}
            >
              <X size={20} />
            </button>
          </div>
          <SheetDescription className="sr-only">
            Clynect Copilot
          </SheetDescription>
          <Suspense fallback={<output>…</output>}>
            <CopilotApp embedded />
          </Suspense>
        </SheetContent>
      </Sheet>
    </>
  );
}
