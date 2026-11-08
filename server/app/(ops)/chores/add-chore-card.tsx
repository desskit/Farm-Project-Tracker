'use client';
import { useRouter } from 'next/navigation';
import type { PersonRow } from '@/lib/data/users';
import { ChoreForm, type ChorePayload } from './chore-form';

export function AddChoreCard({ people }: { people: PersonRow[] }) {
  const router = useRouter();
  return (
    <div className="card">
      <ChoreForm
        people={people}
        submitLabel="Add chore"
        onSubmit={async (payload: ChorePayload) => {
          const res = await fetch('/api/chores', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          });
          if (!res.ok) {
            const data = await res.json().catch(() => ({}));
            return data.error || 'Something went wrong.';
          }
          router.refresh();
          return null;
        }}
      />
    </div>
  );
}
