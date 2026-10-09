// Run: node guard.test.mjs
import { decide, globToRegex } from './guard.mjs';
let fail = 0;
const t = (name, cond) => { if (!cond) { fail++; console.log('FAIL', name); } };
const root = 'C:/repo';
const cfg = { paths: ['src/billing/**', '**/migrations/**', 'src/auth/permissions.ts'], commands: ['\\bterraform\\s+apply\\b'], tools: ['^mcp__db__(delete|update)_'] };
const run = (tool, tool_input, env = {}) => decide({ tool_name: tool, tool_input }, cfg, root, env);

t('glob **/ matches nested', globToRegex('**/migrations/**').test('db/migrations/001.sql'));
t('glob * stays in one folder', !globToRegex('src/*.ts').test('src/a/b.ts'));
t('no config: nothing', decide({ tool_name: 'Edit', tool_input: { file_path: 'src/billing/x.ts' } }, null, root) === null);
t('edit protected (relative)', /billing/.test(run('Edit', { file_path: 'src/billing/charge.ts' }) || ''));
t('edit protected (absolute)', !!run('Write', { file_path: 'C:/repo/src/auth/permissions.ts' }));
t('edit unprotected', run('Edit', { file_path: 'src/ui/button.tsx' }) === null);
t('edit outside repo never matches', run('Edit', { file_path: 'C:/other/src/billing/x.ts' }) === null);
t('shell rm protected', !!run('Bash', { command: 'rm src/billing/old.ts' }));
t('shell redirect into protected', !!run('Bash', { command: 'echo x > db/migrations/002.sql' }));
t('shell read of protected is fine', run('Bash', { command: 'cat src/billing/charge.ts | grep total' }) === null);
t('shell redirect elsewhere is fine', run('Bash', { command: 'grep x src/billing/a.ts > /dev/null' }) === null);
t('protected command', !!run('Bash', { command: 'terraform apply -auto-approve' }));
t('protected tool', !!run('mcp__db__delete_rows', {}));
t('unlock env', run('Edit', { file_path: 'src/billing/charge.ts' }, { GUARD_AUTHORIZED: '1' }) === null);
console.log(`${fail} failures`);
process.exit(fail ? 1 : 0);
