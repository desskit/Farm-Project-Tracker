import { CheckCircle2, Circle, Sparkles } from 'lucide-react';
import type { SessionUser } from '@/lib/auth/session';
import { newsForUser, setupChecklist } from '@/lib/data/setup';
import { Card, ListRow } from '@/components/ui';
import { DismissButton } from './dismiss-button';

/** After an update: what changed, once per person. For admins on a new farm: what's left to set up. */
export async function WhatsNew({ user }: { user: SessionUser }) {
  const [news, setup] = await Promise.all([newsForUser(user), setupChecklist(user)]);
  return (
    <>
      {setup && (
        <Card title={`Getting set up (${setup.filter((x) => x.done).length} of ${setup.length})`} action={<DismissButton url="/api/admin/setup-dismiss" label="Hide this" />} flush>
          {setup.map((x) => (
            <ListRow key={x.key} href={x.done ? undefined : x.href} lead={x.done ? <CheckCircle2 /> : <Circle />} title={x.label} meta={x.done ? 'Done' : x.hint} />
          ))}
        </Card>
      )}
      {news && (
        <Card title={news.title} action={<DismissButton url="/api/account/news-seen" label="Got it" />} flush>
          {news.items.map((i) => <ListRow key={i.text} href={i.href} lead={<Sparkles />} title={i.text} />)}
        </Card>
      )}
    </>
  );
}
