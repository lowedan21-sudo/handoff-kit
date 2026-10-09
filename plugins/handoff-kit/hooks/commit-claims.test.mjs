// Run: node commit-claims.test.mjs
import { extractMessage, check } from './commit-claims.mjs';
let fail = 0;
const t = (name, cond) => { if (!cond) { fail++; console.log('FAIL', name); } };

t('not a commit', extractMessage('git status') === null);
t('git rm of a file named commit-*', extractMessage('git rm -q hooks/commit-claims.mjs') === null);
t('git -c opt commit', extractMessage('git -c core.autocrlf=false commit -qm "x"') === 'x');
t('-m double quotes', extractMessage('git commit -m "fix invoiceTotal rounding"') === 'fix invoiceTotal rounding');
t('-m single quotes', extractMessage("git commit -m 'docs: x'") === 'docs: x');
t('heredoc -F -', /adds tests/.test(extractMessage("git commit -F - <<'EOF'\nfeat: adds tests for taxRate\nEOF")));
// message claims a fix in a file that is not staged
t('named file not staged', check('fix: correct rounding in invoiceTotal.js', ['docs/BUGS.md']).some((w) => /invoiceTotal\.js/.test(w)));
t('fix with only docs', check('fix: rounding', ['docs/BUGS.md']).some((w) => /only docs/.test(w)));
t('tests claimed none staged', check('feat: add tests for taxRate', ['src/lib/taxRate.js']).some((w) => /no test file/.test(w)));
t('nothing staged', check('anything', []).some((w) => /Nothing is staged/.test(w)));
// clean cases produce no warning
t('clean: file matches', check('fix: rounding in src/lib/invoiceTotal.js', ['src/lib/invoiceTotal.js']).length === 0);
t('clean: tests staged', check('feat: add tests', ['src/lib/a.js', 'src/lib/a.test.js']).length === 0);
t('clean: basename match', check('update invoiceTotal.js', ['src/lib/invoiceTotal.js']).length === 0);
console.log(`${fail} failures`);
process.exit(fail ? 1 : 0);
