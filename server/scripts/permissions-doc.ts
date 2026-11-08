/** Writes docs/permissions.md from the permission table. Run: npx tsx scripts/permissions-doc.ts */
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { permissionsMarkdown } from '../lib/domain/permissions-doc';

writeFileSync(path.resolve(__dirname, '../../docs/permissions.md'), permissionsMarkdown());
console.log('wrote docs/permissions.md');
