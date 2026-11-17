'use client';
import { useRouter } from 'next/navigation';
import { LayoutGrid } from 'lucide-react';
import { SIMPLE_COOKIE } from '@/lib/domain/brand';
import { Button } from '@/components/ui';

/** Back to the full app on this phone (the switch is also in Account → Appearance). */
export function SwitchToFull() {
  const router = useRouter();
  return (
    <Button
      block
      variant="secondary"
      icon={<LayoutGrid />}
      onClick={() => { document.cookie = `${SIMPLE_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax`; router.refresh(); }}
    >
      Switch to the full app
    </Button>
  );
}
