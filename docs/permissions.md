# Who sees what

<!-- Generated from lib/domain/permissions.ts by `npx tsx scripts/permissions-doc.ts`. Do not edit by hand. -->

Access is decided by capabilities, never by role names. Each role has defaults;
capabilities marked \* can be switched per person (People → Access), on or off
by default as shown. Admins can see this table in the app at More → Who sees what.

| Capability | Admin | Manager | Family | Crew | Guest | Renter |
|---|:-:|:-:|:-:|:-:|:-:|:-:|
| Use the farm app (`farm.view`) | ✓ | ✓ | ✓ | ✓ | ✓ | — |
| See all work, not just their own and up-for-grabs (`work.viewAll`) | ✓ | ✓ | ✓ | off\* | — | — |
| Complete and log their work (`work.do`) | ✓ | ✓ | ✓ | ✓ | ✓ | — |
| See and pick up work that’s up for grabs (`work.claim`) | ✓ | ✓ | ✓ | ✓ | — | — |
| Create, assign and edit work, assets and upkeep (`work.manage`) | ✓ | ✓ | on\* | off\* | — | — |
| Log supplies used (`supplies.use`) | ✓ | ✓ | ✓ | ✓ | off\* | — |
| Add and edit supplies (`supplies.manage`) | ✓ | ✓ | ✓ | off\* | — | — |
| See money: rent, spending, budgets (`finance.view`) | ✓ | ✓ | off\* | — | — | — |
| Manage rent and record expenses for others (`finance.manage`) | ✓ | ✓ | — | — | — | — |
| Send maintenance requests (`requests.create`) | ✓ | ✓ | ✓ | ✓ | — | ✓ |
| Handle maintenance requests (`requests.manage`) | ✓ | ✓ | off\* | — | — | — |
| See everyone’s names and contact (`people.directory`) | ✓ | ✓ | ✓ | — | — | — |
| See the team page and everyone’s hours (`team.view`) | ✓ | ✓ | ✓ | off\* | — | — |
| Invite people and change access (`people.manage`) | ✓ | — | — | — | — | — |
| Backups, server updates and settings (`system.admin`) | ✓ | — | — | — | — | — |
| Use AI suggestions (`ai.use`) | ✓ | ✓ | off\* | — | — | — |
| See passwords & codes shared with them (`vault.use`) | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Store and share their own passwords & codes (`vault.create`) | ✓ | ✓ | ✓ | ✓ | — | — |
| See the animals (`animals.view`) | ✓ | ✓ | ✓ | ✓ | off\* | — |
| Log eggs, milk, treatments, weights and births (`animals.log`) | ✓ | ✓ | ✓ | ✓ | off\* | — |
| Add animals and groups, record sales, plan breeding (`animals.manage`) | ✓ | ✓ | on\* | off\* | — | — |

## Roles

- **Admin** (`admin`): Everything, including people, backups and server updates.
- **Manager** (`manager`): Runs the farm: plans and assigns work, supplies, money.
- **Family** (`family`): Sees and does everything on the farm; money and managing work are optional.
- **Crew** (`worker`): Hired or seasonal help: does their own work and anything up for grabs.
- **Guest** (`guest`): Volunteers and short visits: only what they’re assigned, until their access ends.
- **Renter** (`renter`): Tenants: their rent, documents and requests — not the farm.

## Rules that sit on top of the table

- **Work visibility:** with “See all work” you see everything; otherwise what you are on, what was sent back to you, and (with “pick up work that is up for grabs”) open work. Upkeep is shared.
- **Rent:** anyone with a rent assignment sees their own charges and documents, whatever their role.
- **Files** are visible according to what they are attached to (rental papers: that renter and money people; receipts: money people or the uploader; other farm files: the farm app; unattached: only the uploader).
- **Access end dates** stop sign-in, sessions and notifications after that day. Admins cannot have one.
- **Preview as person** (admins) shows the app exactly as someone sees it, read-only, for an hour.
