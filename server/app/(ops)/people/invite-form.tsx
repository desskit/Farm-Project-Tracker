'use client';
import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { UserPlus } from 'lucide-react';
import { ASSIGNABLE_ROLES, ROLE_BLURB, ROLE_LABEL, audienceOf, isRole } from '@/lib/domain/permissions';
import { Banner, Button, Card, Field, Input, Select, Stack } from '@/components/ui';
import { InviteLink } from './person-row';

export function InviteForm() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('worker');
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ url: string; emailed: boolean } | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setResult(null);
    const res = await fetch('/api/admin/users', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, email, role }) });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setError(data.error || 'Something went wrong.');
    setResult({ url: data.inviteUrl, emailed: !!data.emailed });
    setName('');
    setEmail('');
    router.refresh();
  }

  return (
    <Card title="Invite someone">
      <form onSubmit={onSubmit}>
        <Stack>
          <Field label="Name" htmlFor="inv-name"><Input id="inv-name" value={name} onChange={(e) => setName(e.target.value)} required /></Field>
          <Field label="Email" htmlFor="inv-email"><Input id="inv-email" type="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></Field>
          <Field
            label="Role"
            htmlFor="inv-role"
            hint={isRole(role) ? `${ROLE_BLURB[role]}${audienceOf(role) === 'guest' ? ' After inviting, set when their access ends under Access.' : ''}` : undefined}
          >
            <Select id="inv-role" value={role} onChange={(e) => setRole(e.target.value)}>
              {ASSIGNABLE_ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
            </Select>
          </Field>
          {error && <Banner tone="danger">{error}</Banner>}
          <Button type="submit" block icon={<UserPlus />} loading={busy}>Add & invite</Button>
          {result && (
            <Banner tone={result.emailed ? 'ok' : 'info'} title={result.emailed ? 'Invite emailed' : 'Invite link'}>
              {result.emailed ? 'They’ll get a link to set their password. Here it is too, if you’d rather send it yourself:' : 'Email isn’t set up (or the send failed), so send them this link:'}
              <InviteLink url={result.url} />
            </Banner>
          )}
        </Stack>
      </form>
    </Card>
  );
}
