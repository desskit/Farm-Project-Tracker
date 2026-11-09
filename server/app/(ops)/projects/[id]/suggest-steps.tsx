'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Sparkles } from 'lucide-react';
import { Button, Card, ListRow } from '@/components/ui';
import s from './project.module.css';

type Step = { title: string; description?: string };

/** Ask Claude for a task breakdown, then add steps one at a time or all at once. */
export function SuggestSteps({ projectId, onError }: { projectId: string; onError: (m: string | null) => void }) {
  const router = useRouter();
  const [steps, setSteps] = useState<Step[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [adding, setAdding] = useState<string | null>(null);

  async function generate() {
    setLoading(true);
    onError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/suggest-steps`, { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return onError(data.error || 'Could not generate suggestions.');
      setSteps(Array.isArray(data.steps) ? data.steps : []);
    } finally {
      setLoading(false);
    }
  }

  async function addStep(step: Step): Promise<boolean> {
    const res = await fetch(`/api/projects/${projectId}/tasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: step.title, description: step.description || '' }),
    });
    if (res.ok) return true;
    onError((await res.json().catch(() => ({}))).error || 'Could not add task.');
    return false;
  }

  async function addOne(step: Step, i: number) {
    setAdding(`one-${i}`);
    onError(null);
    if (await addStep(step)) {
      setSteps((prev) => prev?.filter((_, j) => j !== i) ?? null);
      router.refresh();
    }
    setAdding(null);
  }

  async function addAll() {
    if (!steps?.length) return;
    setAdding('all');
    onError(null);
    for (const step of steps) if (!(await addStep(step))) break;
    setAdding(null);
    setSteps(null);
    router.refresh();
  }

  return (
    <Card title={<span className={s.titleIcon}><Sparkles aria-hidden /> Plan with AI</span>} flush={!!steps?.length}>
      {!steps ? (
        <div className={s.pad}>
          <p className={s.muted}>Let Claude suggest a task breakdown from this project&apos;s name and description.</p>
          <Button variant="secondary" block icon={<Sparkles />} loading={loading} onClick={generate}>Suggest steps</Button>
        </div>
      ) : steps.length === 0 ? (
        <p className={s.muted}>No suggestions came back. Try adding a description, then generate again.</p>
      ) : (
        <>
          {steps.map((st, i) => (
            <ListRow
              key={i}
              title={st.title}
              meta={st.description}
              trail={<Button size="sm" icon={<Plus />} loading={adding === `one-${i}`} disabled={adding !== null} onClick={() => addOne(st, i)}>Add</Button>}
            />
          ))}
          <div className={`${s.row} ${s.pad}`}>
            <Button loading={adding === 'all'} disabled={adding !== null} onClick={addAll}>Add all {steps.length}</Button>
            <Button variant="ghost" disabled={adding !== null} onClick={() => setSteps(null)}>Discard</Button>
          </div>
        </>
      )}
    </Card>
  );
}
