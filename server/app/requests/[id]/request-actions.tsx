'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Banner, Button, Card, Field, Select, Stack, Textarea } from '@/components/ui';
import type { RequestStatus } from '@/db/schema';

/** Reply, and for people who handle requests, change the status with a note. */
export function RequestActions({ id, status, manages }: { id: string; status: RequestStatus; manages: boolean }) {
  const router = useRouter();
  const [text, setText] = useState('');
  const [next, setNext] = useState<RequestStatus>(status);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function send() {
    setBusy(true);
    setError('');
    try {
      const statusChanged = manages && next !== status;
      const res = statusChanged
        ? await fetch(`/api/requests/${id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: next, note: text }),
          })
        : await fetch(`/api/requests/${id}/comments`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Idempotency-Key': crypto.randomUUID() },
            body: JSON.stringify({ body: text }),
          });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Could not send.');
      setText('');
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not send.');
    } finally {
      setBusy(false);
    }
  }

  const statusChanged = manages && next !== status;
  return (
    <Card title={manages ? 'Reply or update' : 'Reply'}>
      <Stack>
        {manages && (
          <Field label="Status" htmlFor="rq-status">
            <Select id="rq-status" value={next} onChange={(e) => setNext(e.target.value as RequestStatus)}>
              <option value="open">Open</option>
              <option value="in_progress">Being worked on</option>
              <option value="done">Done</option>
              <option value="declined">Declined</option>
            </Select>
          </Field>
        )}
        <Field label={statusChanged ? 'Note (optional)' : 'Message'} htmlFor="rq-reply">
          <Textarea id="rq-reply" value={text} onChange={(e) => setText(e.target.value)} maxLength={4000} />
        </Field>
        {error && <Banner tone="danger">{error}</Banner>}
        <div>
          <Button onClick={send} loading={busy} disabled={!statusChanged && !text.trim()}>
            {statusChanged ? 'Update status' : 'Send'}
          </Button>
        </div>
      </Stack>
    </Card>
  );
}
