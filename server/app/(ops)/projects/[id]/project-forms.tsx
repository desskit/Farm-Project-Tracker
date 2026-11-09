'use client';
import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Plus } from 'lucide-react';
import type { ProjectRow, TaskRow } from '@/lib/data/projects';
import type { PersonRow } from '@/lib/data/users';
import { AssigneePicker } from '@/app/_components/assignee-picker';
import { Button, Field, Input, Select, Stack, Switch, Textarea } from '@/components/ui';
import s from './project.module.css';

type TaskDraft = { title: string; description: string; assigneeIds: string[]; dueDate: string; open: boolean; requirePhoto: boolean; repeatEvery: string; repeatUnit: 'none' | 'days' | 'weeks' | 'months' };
const repeatOf = (t: Pick<TaskRow, 'repeat'>): Pick<TaskDraft, 'repeatEvery' | 'repeatUnit'> => ({ repeatEvery: String(t.repeat?.every ?? 1), repeatUnit: t.repeat?.unit ?? 'none' });

/** The fields shared by "add a task" and "edit task". */
function TaskFields({ d, set, people, idp }: { d: TaskDraft; set: (p: Partial<TaskDraft>) => void; people: PersonRow[]; idp: string }) {
  return (
    <>
      <Field label="Title" htmlFor={`${idp}-title`}>
        <Input id={`${idp}-title`} value={d.title} onChange={(e) => set({ title: e.target.value })} required placeholder="e.g. Frame the walls" />
      </Field>
      <Field label="Details (optional)" htmlFor={`${idp}-desc`}>
        <Textarea id={`${idp}-desc`} value={d.description} onChange={(e) => set({ description: e.target.value })} rows={2} />
      </Field>
      <AssigneePicker people={people} value={d.assigneeIds} onChange={(assigneeIds) => set({ assigneeIds })} />
      <Field label="Due date (optional)" htmlFor={`${idp}-due`}>
        <Input id={`${idp}-due`} type="date" value={d.dueDate} onChange={(e) => set({ dueDate: e.target.value })} />
      </Field>
      <Field label="Repeats" htmlFor={`${idp}-rep`} hint={d.repeatUnit === 'none' ? undefined : 'When it’s done, the next one is added with the same people.'}>
        <div className={s.repeatRow}>
          {d.repeatUnit !== 'none' && <Input aria-label="Every how many" type="number" inputMode="numeric" min="1" max="365" value={d.repeatEvery} onChange={(e) => set({ repeatEvery: e.target.value })} />}
          <Select id={`${idp}-rep`} value={d.repeatUnit} onChange={(e) => set({ repeatUnit: e.target.value as TaskDraft['repeatUnit'] })}>
            <option value="none">Doesn’t repeat</option>
            <option value="days">{d.repeatUnit === 'none' ? 'Every … days' : 'days'}</option>
            <option value="weeks">{d.repeatUnit === 'none' ? 'Every … weeks' : 'weeks'}</option>
            <option value="months">{d.repeatUnit === 'none' ? 'Every … months' : 'months'}</option>
          </Select>
        </div>
      </Field>
      <Switch label="Up for grabs" hint="Anyone on the crew can take it." checked={d.open} onChange={(open) => set({ open })} />
      <Switch label="Needs a photo" hint="Ask for a photo when it's marked done." checked={d.requirePhoto} onChange={(requirePhoto) => set({ requirePhoto })} />
    </>
  );
}

async function send(url: string, method: string, body: unknown): Promise<string | null> {
  const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (res.ok) return null;
  return (await res.json().catch(() => ({}))).error || 'Something went wrong.';
}

const payload = ({ repeatEvery, repeatUnit, ...d }: TaskDraft) => ({
  ...d,
  dueDate: d.dueDate || null,
  repeat: repeatUnit === 'none' ? null : { every: Math.max(1, Math.floor(Number(repeatEvery) || 1)), unit: repeatUnit },
});

export function AddTaskForm({ projectId, people, onError }: { projectId: string; people: PersonRow[]; onError: (m: string | null) => void }) {
  const router = useRouter();
  const empty: TaskDraft = { title: '', description: '', assigneeIds: [], dueDate: '', open: false, requirePhoto: false, repeatEvery: '1', repeatUnit: 'none' };
  const [d, setD] = useState(empty);
  const [busy, setBusy] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    onError(null);
    const err = await send(`/api/projects/${projectId}/tasks`, 'POST', payload(d));
    setBusy(false);
    if (err) return onError(err);
    setD(empty);
    router.refresh();
  }
  return (
    <form onSubmit={submit}>
      <Stack>
        <TaskFields d={d} set={(p) => setD((x) => ({ ...x, ...p }))} people={people} idp="new-task" />
        <Button type="submit" block icon={<Plus />} loading={busy}>Add task</Button>
      </Stack>
    </form>
  );
}

export function EditTaskForm({ task, people, onDone, onError }: { task: TaskRow; people: PersonRow[]; onDone: () => void; onError: (m: string | null) => void }) {
  const router = useRouter();
  const [d, setD] = useState<TaskDraft>({
    title: task.title, description: task.description ?? '', assigneeIds: task.assigneeIds,
    dueDate: task.dueDate ?? '', open: task.open, requirePhoto: task.requirePhoto, ...repeatOf(task),
  });
  const [busy, setBusy] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    onError(null);
    const err = await send(`/api/tasks/${task.id}`, 'PATCH', payload(d));
    setBusy(false);
    if (err) return onError(err);
    onDone();
    router.refresh();
  }
  return (
    <form onSubmit={submit} className={s.inlineForm}>
      <Stack>
        <TaskFields d={d} set={(p) => setD((x) => ({ ...x, ...p }))} people={people} idp={`task-${task.id}`} />
        <div className={s.row}>
          <Button type="submit" loading={busy}>Save task</Button>
          <Button variant="ghost" onClick={onDone}>Cancel</Button>
        </div>
      </Stack>
    </form>
  );
}

/** Edit a project's name, description, target date and budget. */
export function EditProjectForm({ project, onDone, onError }: { project: ProjectRow; onDone: () => void; onError: (m: string | null) => void }) {
  const router = useRouter();
  const [name, setName] = useState(project.name);
  const [description, setDescription] = useState(project.description ?? '');
  const [targetDate, setTargetDate] = useState(project.targetDate ?? '');
  const [budget, setBudget] = useState(project.budget == null ? '' : String(project.budget));
  const [busy, setBusy] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    onError(null);
    const err = await send(`/api/projects/${project.id}`, 'PATCH', {
      name, description, targetDate: targetDate || null, budget: budget.trim() === '' ? null : Number(budget),
    });
    setBusy(false);
    if (err) return onError(err);
    onDone();
    router.refresh();
  }
  return (
    <form onSubmit={submit} className={s.inlineForm}>
      <Stack>
        <Field label="Name" htmlFor="proj-name"><Input id="proj-name" value={name} onChange={(e) => setName(e.target.value)} required /></Field>
        <Field label="Description" htmlFor="proj-desc"><Textarea id="proj-desc" value={description} onChange={(e) => setDescription(e.target.value)} rows={3} /></Field>
        <Field label="Target date (optional)" htmlFor="proj-target"><Input id="proj-target" type="date" value={targetDate} onChange={(e) => setTargetDate(e.target.value)} /></Field>
        <Field label="Budget (optional)" htmlFor="proj-budget" hint="Leave blank for no budget.">
          <Input id="proj-budget" type="number" step="0.01" min={0} inputMode="decimal" value={budget} onChange={(e) => setBudget(e.target.value)} />
        </Field>
        <div className={s.row}>
          <Button type="submit" loading={busy}>Save project</Button>
          <Button variant="ghost" onClick={onDone}>Cancel</Button>
        </div>
      </Stack>
    </form>
  );
}
