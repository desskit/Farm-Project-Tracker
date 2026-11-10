'use client';
import { useRouter } from 'next/navigation';
import { useMutation } from '@/lib/client/mutate';
import { Button } from '@/components/ui';

/** Posts to `url` and refreshes: "Got it" / "Hide this" on Today's cards. */
export function DismissButton({ url, label }: { url: string; label: string }) {
  const router = useRouter();
  const m = useMutation();
  return (
    <Button size="sm" variant="ghost" loading={m.busy} onClick={async () => { if (await m.run({ url, body: {}, label })) router.refresh(); }}>
      {label}
    </Button>
  );
}
