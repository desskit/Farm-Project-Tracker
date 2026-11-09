import Link from 'next/link';
import { History } from 'lucide-react';
import { getSessionUser } from '@/lib/auth/session';
import { listActivity } from '@/lib/data/activity';
import { listUsers } from '@/lib/data/users';
import { onTeam } from '@/lib/domain/permissions';
import { Button, Card, EmptyState, Select } from '@/components/ui';
import { Screen } from '@/components/patterns/screen';
import s from './activity.module.css';

export default async function ActivityPage({ searchParams }: { searchParams: { person?: string } }) {
  const user = await getSessionUser();
  if (!user) return null; // middleware already guards this route
  const people = (await listUsers()).filter((p) => onTeam(p.role));
  const person = people.some((p) => p.id === searchParams.person) ? searchParams.person : undefined;
  const acts = await listActivity(user, 80, person);

  return (
    <Screen title="Activity" subtitle="What's been done and changed, newest first" back="/more">
      <form className={s.filter} method="get">
        <Select name="person" defaultValue={person ?? ''} aria-label="Whose activity">
          <option value="">Everyone</option>
          {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </Select>
        <Button type="submit" variant="secondary">Show</Button>
      </form>
      <Card flush>
        {!acts.length ? (
          <EmptyState icon={<History />} title="Nothing yet">Completed work and changes will show up here.</EmptyState>
        ) : (
          acts.map((a) => {
            const body = <><strong>{a.userName}</strong> {a.text}</>;
            return (
              <div className={s.row} key={a.id}>
                {a.href ? <Link href={a.href} className={`${s.text} ${s.link}`}>{body}</Link> : <span className={s.text}>{body}</span>}
                <time className={s.when} dateTime={new Date(a.ts).toISOString()}>
                  {new Date(a.ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                </time>
              </div>
            );
          })
        )}
      </Card>
    </Screen>
  );
}
