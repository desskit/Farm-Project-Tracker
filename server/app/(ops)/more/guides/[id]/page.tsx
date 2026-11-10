import { notFound } from 'next/navigation';
import { getSessionUser } from '@/lib/auth/session';
import { guideById } from '@/lib/data/guides';
import { can } from '@/lib/domain/permissions';
import { Card } from '@/components/ui';
import { Screen } from '@/components/patterns/screen';
import { GuideEditorButton } from '../guide-editor';
import s from '../../../farm/animals/animals.module.css';

export default async function GuidePage({ params }: { params: { id: string } }) {
  const user = await getSessionUser();
  if (!user || !can(user, 'farm.view')) notFound();
  const g = await guideById(params.id);
  if (!g) notFound();
  const photosFor = (step: number) => g.photos.filter((p) => p.step === step);
  const Photos = ({ step }: { step: number }) =>
    photosFor(step).length ? (
      <span className={s.thumbs}>
        {photosFor(step).map((p) => (
          <a key={p.attachmentId} href={`/api/attachments/${p.attachmentId}`} target="_blank" rel="noopener">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`/api/attachments/${p.attachmentId}`} alt={step < 0 ? g.title : `Step ${step + 1}`} loading="lazy" />
          </a>
        ))}
      </span>
    ) : null;

  return (
    <Screen
      title={g.title}
      subtitle={g.summary || undefined}
      back="/more/guides"
      actions={can(user, 'work.manage') ? <GuideEditorButton guide={{ id: g.id, title: g.title, summary: g.summary, steps: g.steps, photos: g.photos }} /> : undefined}
    >
      <Photos step={-1} />
      <Card flush>
        {g.steps.map((st, i) => (
          <div key={i} className={s.event}>
            <strong className={s.stepNo}>{i + 1}</strong>
            <span className={s.eventMain}>
              <span>{st.text}</span>
              <Photos step={i} />
            </span>
          </div>
        ))}
      </Card>
    </Screen>
  );
}
