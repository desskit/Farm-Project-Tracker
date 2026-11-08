import { notFound } from 'next/navigation';
import { getSessionUser } from '@/lib/auth/session';
import { CAPS, CAP_LABEL, ROLES, ROLE_BLURB, ROLE_LABEL, accessOf, can } from '@/lib/domain/permissions';
import { Card, PageHeader } from '@/components/ui';
import s from './access.module.css';

export const metadata = { title: 'Who sees what · Farm Project Tracker' };

const MARK = { yes: '✓', 'switch-on': 'On*', 'switch-off': 'Off*', no: '—' } as const;

/**
 * "Who sees what", generated from the permission table itself, so it can
 * never disagree with what the app actually enforces.
 */
export default async function AccessPage() {
  const user = await getSessionUser();
  if (!user || !can(user, 'people.manage')) notFound();
  return (
    <main className={s.wrap}>
      <PageHeader title="Who sees what" subtitle="What each role can do. * = can be switched per person on the People page." />
      <Card flush>
        <div className={s.scroll}>
          <table className={s.table}>
            <thead>
              <tr>
                <th scope="col">Can…</th>
                {ROLES.map((r) => (
                  <th key={r} scope="col">{ROLE_LABEL[r]}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {CAPS.map((c) => (
                <tr key={c}>
                  <th scope="row">{CAP_LABEL[c]}</th>
                  {ROLES.map((r) => {
                    const a = accessOf(r, c);
                    return (
                      <td key={r} className={s[a.replace('-', '_')]}>
                        {MARK[a]}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      <Card title="The roles">
        <dl className={s.roles}>
          {ROLES.map((r) => (
            <div key={r}>
              <dt>{ROLE_LABEL[r]}</dt>
              <dd>{ROLE_BLURB[r]}</dd>
            </div>
          ))}
        </dl>
        <p className={s.note}>
          Anyone who pays rent also sees their own rent and documents, whatever their role. Crew without “See all work”
          see what they’re on, what was sent back to them, and anything up for grabs. Guests see only what they’re on.
        </p>
      </Card>
    </main>
  );
}
