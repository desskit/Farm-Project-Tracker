'use client';
/**
 * In-app replacements for window.confirm / window.prompt: same promise-style
 * API, but a real dialog in the farm's look that works the same on every
 * phone (and doesn't get blocked or styled away by the browser).
 *
 *   const { confirm, prompt } = useDialogs();
 *   if (!(await confirm('Delete this note?'))) return;
 *   const reason = await prompt('Reason (optional):', '');   // null = cancelled
 */
import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';
import { Dialog } from './interactive';
import { Button, Field, Input, Stack } from './primitives';

type ConfirmOpts = { title?: string; confirmLabel?: string; danger?: boolean };
type Request =
  | { kind: 'confirm'; message: string; opts: ConfirmOpts; resolve: (v: boolean) => void }
  | { kind: 'prompt'; message: string; value: string; resolve: (v: string | null) => void };

type Api = {
  confirm: (message: string, opts?: ConfirmOpts) => Promise<boolean>;
  prompt: (message: string, defaultValue?: string) => Promise<string | null>;
};

const Ctx = createContext<Api | null>(null);

/** Destructive wording gets a red button labelled with the action itself. */
function infer(message: string, opts: ConfirmOpts): Required<Omit<ConfirmOpts, 'title'>> & { title: string } {
  const verb = /^(Delete|Remove|Replace|Stop|Deactivate|Discard)\b/.exec(message)?.[1];
  return {
    title: opts.title ?? (verb ? `${verb}?` : 'Are you sure?'),
    confirmLabel: opts.confirmLabel ?? verb ?? 'OK',
    danger: opts.danger ?? !!verb,
  };
}

export function DialogsProvider({ children }: { children: ReactNode }) {
  const [req, setReq] = useState<Request | null>(null);
  const [value, setValue] = useState('');
  const settled = useRef(false);

  const confirm = useCallback<Api['confirm']>(
    (message, opts = {}) =>
      new Promise((resolve) => {
        settled.current = false;
        setReq({ kind: 'confirm', message, opts, resolve });
      }),
    [],
  );
  const prompt = useCallback<Api['prompt']>(
    (message, defaultValue = '') =>
      new Promise((resolve) => {
        settled.current = false;
        setValue(defaultValue);
        setReq({ kind: 'prompt', message, value: defaultValue, resolve });
      }),
    [],
  );

  function finish(ok: boolean) {
    if (!req || settled.current) return;
    settled.current = true;
    if (req.kind === 'confirm') req.resolve(ok);
    else req.resolve(ok ? value : null);
    setReq(null);
  }

  const look = req?.kind === 'confirm' ? infer(req.message, req.opts) : null;

  return (
    <Ctx.Provider value={{ confirm, prompt }}>
      {children}
      <Dialog open={!!req} onClose={() => finish(false)} title={look ? look.title : 'One more thing'}>
        {req && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              finish(true);
            }}
          >
            <Stack>
              {req.kind === 'confirm' ? (
                <p style={{ margin: 0 }}>{req.message}</p>
              ) : (
                <Field label={req.message} htmlFor="dlg-prompt">
                  <Input id="dlg-prompt" autoFocus value={value} onChange={(e) => setValue(e.target.value)} />
                </Field>
              )}
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <Button type="submit" variant={look?.danger ? 'danger' : 'primary'}>
                  {look ? look.confirmLabel : 'OK'}
                </Button>
                <Button variant="ghost" onClick={() => finish(false)}>
                  Cancel
                </Button>
              </div>
            </Stack>
          </form>
        )}
      </Dialog>
    </Ctx.Provider>
  );
}

export function useDialogs(): Api {
  const api = useContext(Ctx);
  if (!api) throw new Error('useDialogs needs <DialogsProvider> (it is in the root layout).');
  return api;
}
