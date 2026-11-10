'use client';
import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation } from '@/lib/client/mutate';
import { Banner, Button, Field, Input } from '@/components/ui';
import s from '../../animals/animals.module.css';

/** Average last spring frost and first autumn frost. The year in the picker is ignored. */
export function FrostForm({ year, lastSpring, firstFall }: { year: number; lastSpring: string | null; firstFall: string | null }) {
  const router = useRouter();
  const m = useMutation();
  const [spring, setSpring] = useState(lastSpring ? `${year}-${lastSpring}` : '');
  const [fall, setFall] = useState(firstFall ? `${year}-${firstFall}` : '');
  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (await m.run({ url: '/api/land/frost', body: { lastSpring: spring.slice(5), firstFall: fall.slice(5) }, label: 'Frost dates' })) router.refresh();
  }
  return (
    <form className={s.form} onSubmit={onSubmit}>
      <div className={s.two}>
        <Field label="Last spring frost" htmlFor="fr-s" hint="On average. Your extension office or seed supplier lists it."><Input id="fr-s" type="date" value={spring} onChange={(e) => setSpring(e.target.value)} required /></Field>
        <Field label="First autumn frost" htmlFor="fr-f"><Input id="fr-f" type="date" value={fall} onChange={(e) => setFall(e.target.value)} required /></Field>
      </div>
      {m.error && <Banner tone="danger">{m.error}</Banner>}
      <div className={s.actions}><Button type="submit" size="sm" loading={m.busy} disabled={!spring || !fall}>Save</Button></div>
    </form>
  );
}
