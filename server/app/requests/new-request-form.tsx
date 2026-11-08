'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Camera } from 'lucide-react';
import { Banner, Button, Card, Field, Input, Stack, Switch, Textarea } from '@/components/ui';
import { uploadPhoto } from '@/lib/client/photo';
import s from './requests.module.css';

/** "Something needs fixing" — title, details, optional photo, urgent flag. */
export function NewRequestForm() {
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [details, setDetails] = useState('');
  const [urgent, setUrgent] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const photoId = file ? await uploadPhoto(file) : null;
      const res = await fetch('/api/requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': crypto.randomUUID() },
        body: JSON.stringify({ title, details, urgent, photoId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Could not send.');
      setTitle('');
      setDetails('');
      setUrgent(false);
      setFile(null);
      setSent(true);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card title="Report something">
      <form onSubmit={submit}>
        <Stack>
          <Field label="What needs fixing?" htmlFor="rq-title">
            <Input id="rq-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={140} placeholder="Kitchen sink is leaking" required />
          </Field>
          <Field label="Details (optional)" htmlFor="rq-details" hint="Where it is, when it started, anything we should know.">
            <Textarea id="rq-details" value={details} onChange={(e) => setDetails(e.target.value)} maxLength={4000} />
          </Field>
          <label className={s.fileLabel}>
            <Camera aria-hidden />
            {file ? file.name : 'Add a photo'}
            <input type="file" accept="image/*" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          </label>
          <Switch label="Urgent" hint="Water, heat, power or safety — we'll be notified right away." checked={urgent} onChange={setUrgent} />
          {error && <Banner tone="danger">{error}</Banner>}
          {sent && !error && <Banner tone="ok">Sent. You&apos;ll get updates here.</Banner>}
          <div>
            <Button type="submit" loading={busy} disabled={!title.trim()}>Send request</Button>
          </div>
        </Stack>
      </form>
    </Card>
  );
}
