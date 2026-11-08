'use client';

import { useState, type CSSProperties } from 'react';
import { useRouter } from 'next/navigation';
import {
  Bell, Droplets, Egg, Home, ListChecks, MoreHorizontal, Package, Plus, Sprout, Sun, Wrench,
} from 'lucide-react';
import {
  AvatarStack, Badge, Banner, Button, Card, Dialog, EmptyState, Fab, Field, IconButton, Input, ListRow,
  PageHeader, Segmented, Select, Skeleton, Stack, StatusPill, Switch, Textarea,
} from '@/components/ui';
import { THEME_COOKIE, type BrandId, type ThemePref } from '@/lib/domain/brand';
import g from './gallery.module.css';

const SWATCHES = ['--c-primary', '--c-accent', '--c-bg', '--c-surface', '--c-danger', '--c-warn', '--c-ok'];

export function Gallery({ current, theme }: { current: BrandId; theme: ThemePref }) {
  const router = useRouter();

  function setTheme(t: ThemePref) {
    document.cookie =
      t === 'system'
        ? `${THEME_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax`
        : `${THEME_COOKIE}=${t}; Path=/; Max-Age=31536000; SameSite=Lax`;
    router.refresh();
  }

  return (
    <main className={g.wrap}>
      <PageHeader title="Design gallery" subtitle="Admin only. The building blocks the redesigned screens use." />

      <section className={g.section}>
        <h2 className={g.h2}>Today, light and dark</h2>
        <p className={g.lede}>A preview of the redesigned Today screen in the farm&apos;s colors.</p>
        <div className={g.phones}>
          <PhoneMock brand={current} mode="light" />
          <PhoneMock brand={current} mode="dark" />
        </div>
      </section>

      <section className={g.section}>
        <h2 className={g.h2}>Light or dark</h2>
        <p className={g.lede}>Saved on this device only. &ldquo;Auto&rdquo; follows the phone&apos;s setting.</p>
        <div className={g.picker}>
          <Segmented<ThemePref>
            label="Appearance"
            value={theme}
            onChange={setTheme}
            options={[
              { value: 'system', label: 'Auto' },
              { value: 'light', label: 'Light' },
              { value: 'dark', label: 'Dark' },
            ]}
          />
        </div>
      </section>

      <section className={g.section}>
        <h2 className={g.h2}>Components</h2>
        <p className={g.lede}>The building blocks every redesigned screen uses, shown in the current mode.</p>
        <KitShowcase />
      </section>
    </main>
  );
}

/** Mock Today screen. data-brand/data-theme on the wrapper repaint everything inside. */
function PhoneMock({ brand, mode }: { brand: BrandId; mode: 'light' | 'dark' }) {
  return (
    <div className={g.phone} data-brand={brand} data-theme={mode} aria-label={`${brand} ${mode} preview`}>
      <span className={g.modeTag}>{mode === 'light' ? 'Light' : 'Dark'}</span>
      <div className={g.topbar}>
        <div className={g.greeting}>Good morning, Sam</div>
        <div className={g.topTitle}>Today</div>
        <div className={g.weather}><Sun aria-hidden /> 48° · Frost tonight, cover the beds</div>
      </div>
      <div className={g.screen}>
        <Banner tone="warn" title="Rain Thursday">Move the hay delivery up a day.</Banner>
        <Card title="Needs doing" action={<Badge count={3} label="3 overdue" />} flush>
          <ListRow
            lead={<Droplets />}
            title="Check waterers"
            meta={<StatusPill tone="overdue">2 days late</StatusPill>}
            trail={<AvatarStack names={['Sam Lee', 'Jo Park']} />}
            chevron
          />
          <ListRow lead={<Egg />} title="Collect eggs" meta={<StatusPill tone="today">Due today</StatusPill>} chevron />
          <ListRow lead={<Wrench />} title="Grease the tractor" meta={<StatusPill tone="upcoming">Fri</StatusPill>} chevron />
          <ListRow lead={<Sprout />} title="Seed garlic bed 3" meta={<StatusPill tone="done">Done by Jo</StatusPill>} chevron />
        </Card>
        <div className={g.actions}>
          <Button size="sm" icon={<Plus />}>Log supplies</Button>
          <Button size="sm" variant="secondary">Start timer</Button>
        </div>
      </div>
      <nav className={g.nav} aria-hidden>
        <span className={`${g.navItem} ${g.navOn}`}><Home />Today</span>
        <span className={g.navItem}><ListChecks />Work<span className={g.navBadge}><Badge count={3} /></span></span>
        <span className={g.fabSlot}><Fab label="Quick log" tabIndex={-1}><Plus /></Fab></span>
        <span className={g.navItem}><Package />Farm</span>
        <span className={g.navItem}><MoreHorizontal />More</span>
      </nav>
    </div>
  );
}

function KitShowcase() {
  const [on, setOn] = useState(true);
  const [seg, setSeg] = useState<'mine' | 'open' | 'all'>('mine');
  const [dialog, setDialog] = useState(false);
  const [sheet, setSheet] = useState(false);
  const [busy, setBusy] = useState(false);

  return (
    <div className={g.kitGrid}>
      <Card title="Colors">
        <div className={g.swatches}>
          {SWATCHES.map((v) => (
            <span key={v} className={g.swatch} style={{ background: `var(${v})` } as CSSProperties} title={v} />
          ))}
        </div>
      </Card>

      <Card title="Buttons">
        <Stack>
          <div className={g.row}>
            <Button>Primary</Button>
            <Button variant="secondary">Secondary</Button>
            <Button variant="ghost">Ghost</Button>
          </div>
          <div className={g.row}>
            <Button variant="accent" icon={<Plus />}>Accent</Button>
            <Button variant="danger">Delete</Button>
            <Button disabled>Disabled</Button>
          </div>
          <div className={g.row}>
            <Button size="sm">Small</Button>
            <Button
              size="sm"
              variant="secondary"
              loading={busy}
              onClick={() => {
                setBusy(true);
                setTimeout(() => setBusy(false), 1200);
              }}
            >
              {busy ? 'Saving…' : 'Tap to load'}
            </Button>
            <IconButton label="Notifications"><Bell /></IconButton>
          </div>
          <Button block>Full width</Button>
        </Stack>
      </Card>

      <Card title="Status">
        <Stack>
          <div className={g.row}>
            <StatusPill tone="overdue">Overdue</StatusPill>
            <StatusPill tone="today">Today</StatusPill>
            <StatusPill tone="upcoming">Upcoming</StatusPill>
          </div>
          <div className={g.row}>
            <StatusPill tone="done">Done</StatusPill>
            <StatusPill tone="info">Info</StatusPill>
            <StatusPill tone="neutral">Paused</StatusPill>
          </div>
          <div className={g.row}>
            <Badge count={4} />
            <Badge count={120} />
            <Badge count={2} quiet />
            <AvatarStack names={['Sam Lee', 'Jo Park', 'Ana Ruiz', 'Lee Wong', 'Kim']} />
          </div>
        </Stack>
      </Card>

      <Card title="Banners">
        <Stack>
          <Banner tone="info" title="Heads up">Feed delivery is Tuesday.</Banner>
          <Banner tone="ok">Rent marked paid.</Banner>
          <Banner tone="warn" title="Access ends Friday">Guest access for Kim runs out in 3 days.</Banner>
          <Banner tone="danger" title="Couldn't save">You&apos;re offline. It will send when you reconnect.</Banner>
        </Stack>
      </Card>

      <Card title="Form">
        <Stack>
          <Field label="Chore name" htmlFor="k-name" hint="Short and specific works best.">
            <Input id="k-name" placeholder="Check waterers" />
          </Field>
          <Field label="Repeats" htmlFor="k-rep">
            <Select id="k-rep" defaultValue="daily">
              <option value="daily">Every day</option>
              <option value="weekly">Every week</option>
              <option value="once">Just once</option>
            </Select>
          </Field>
          <Field label="Amount" htmlFor="k-amt" error="Enter a number above zero.">
            <Input id="k-amt" inputMode="decimal" defaultValue="-2" aria-invalid />
          </Field>
          <Field label="Notes" htmlFor="k-notes">
            <Textarea id="k-notes" placeholder="Anything the next person should know" />
          </Field>
          <Switch label="Needs a photo" hint="Ask for a photo when it's marked done." checked={on} onChange={setOn} />
          <Segmented
            label="Show"
            value={seg}
            onChange={setSeg}
            options={[
              { value: 'mine', label: 'Mine' },
              { value: 'open', label: 'Up for grabs' },
              { value: 'all', label: 'All' },
            ]}
          />
        </Stack>
      </Card>

      <Card title="Dialogs">
        <Stack>
          <p className={g.lede}>Replace the browser&apos;s prompt/confirm boxes. The sheet slides up from the bottom on phones.</p>
          <div className={g.row}>
            <Button variant="secondary" onClick={() => setDialog(true)}>Open dialog</Button>
            <Button variant="secondary" onClick={() => setSheet(true)}>Open sheet</Button>
          </div>
        </Stack>
        <Dialog open={dialog} onClose={() => setDialog(false)} title="Delete this chore?">
          <Stack>
            <p>Its history stays in the activity log. This can&apos;t be undone.</p>
            <div className={g.row}>
              <Button variant="danger" onClick={() => setDialog(false)}>Delete</Button>
              <Button variant="ghost" onClick={() => setDialog(false)}>Cancel</Button>
            </div>
          </Stack>
        </Dialog>
        <Dialog sheet open={sheet} onClose={() => setSheet(false)} title="Log supplies used">
          <Stack>
            <Field label="Item" htmlFor="k-item">
              <Select id="k-item"><option>Layer feed (50 lb)</option><option>Hay bales</option></Select>
            </Field>
            <Field label="How many" htmlFor="k-qty"><Input id="k-qty" inputMode="decimal" defaultValue="1" /></Field>
            <Button block onClick={() => setSheet(false)}>Save</Button>
          </Stack>
        </Dialog>
      </Card>

      <Card title="Lists" flush>
        <ListRow lead={<Droplets />} title="Check waterers" meta="Daily · Sam, Jo" href="#" />
        <ListRow lead={<Wrench />} title="Tractor oil change" meta="Every 50 hours · due at 500" trail={<StatusPill tone="overdue">12 h over</StatusPill>} />
        <ListRow lead={<Package />} title="Layer feed" meta="3 bags left" trail={<StatusPill tone="today">Low</StatusPill>} />
      </Card>

      <Card title="Empty & loading">
        <EmptyState icon={<Sprout />} title="Nothing due today" action={<Button size="sm" variant="secondary">See the week</Button>}>
          Enjoy it. New chores show up here as they come due.
        </EmptyState>
        <Stack gap={8}>
          <Skeleton h={18} w="60%" />
          <Skeleton h={14} />
          <Skeleton h={14} w="80%" />
        </Stack>
      </Card>
    </div>
  );
}
