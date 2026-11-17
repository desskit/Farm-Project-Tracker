'use client';
import { useRouter } from 'next/navigation';
import { Check, X } from 'lucide-react';
import { useMutation } from '@/lib/client/mutate';
import { useDialogs } from '@/components/ui/dialogs';
import { Banner, Button } from '@/components/ui';
import s from './simple-home.module.css';

/**
 * The buttons on one rent line: Confirm / Not received when a tenant says
 * they paid, Record payment when cash or a check was handed over.
 */
export function RentLineActions({ id, status, who, amount }: { id: string; status: 'paid' | 'waiting' | 'owed' | 'late'; who: string; amount: number }) {
  const router = useRouter();
  const m = useMutation();
  const { confirm: askConfirm } = useDialogs();
  const money = `$${amount.toFixed(2)}`;
  async function send(action: 'verify' | 'reopen', label: string) {
    if (await m.run({ url: `/api/rent/${id}/${action}`, body: {}, label })) router.refresh();
  }
  if (status === 'paid') return null;
  return (
    <>
      <div className={s.bigActions}>
        {status === 'waiting' ? (
          <>
            <Button icon={<Check />} loading={m.busy} onClick={() => send('verify', `Confirmed ${money}`)}>Confirm</Button>
            <Button
              variant="secondary"
              icon={<X />}
              disabled={m.busy}
              onClick={async () => { if (await askConfirm(`Mark ${money} from ${who} as not received?`)) send('reopen', 'Not received'); }}
            >
              Not received
            </Button>
          </>
        ) : (
          <Button
            icon={<Check />}
            loading={m.busy}
            onClick={async () => { if (await askConfirm(`Record ${money} from ${who} as paid?`)) send('verify', `Recorded ${money}`); }}
          >
            Record payment
          </Button>
        )}
      </div>
      {m.error && <Banner tone="danger">{m.error}</Banner>}
    </>
  );
}
