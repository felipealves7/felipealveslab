// Runs evaluateSql for model-written SQL in a separate Node process with a hard deadline.
// A process boundary is deliberate: stopping a Worker thread does not promptly interrupt a running
// native SQLite query, but killing the process does.
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export function evaluateSafely(rows, c, sql, { modelError = false, timeoutMs = 2000 } = {}) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, ['--max-old-space-size=64', fileURLToPath(new URL('./sql-worker.mjs', import.meta.url))], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { PATH: process.env.PATH ?? '', NODE_NO_WARNINGS: '1' },
    });
    let settled = false;
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    let oversized = false;
    const base = { id: c.id, text: c.text, suite: c.suite, type: c.type, want: c.expected(rows), sql };
    const finish = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(result);
    };
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGKILL');
    }, timeoutMs);
    child.stdout.on('data', (b) => {
      stdout += b;
      if (Buffer.byteLength(stdout) > 1048576) {
        oversized = true;
        child.kill('SIGKILL');
      }
    });
    child.stderr.on('data', (b) => {
      if (stderr.length < 1000) stderr += b;
    });
    child.once('error', (e) => finish({ ...base, verdict: 'query_error', reason: e.message.slice(0, 200) }));
    child.once('close', (code) => {
      if (timedOut) return finish({ ...base, verdict: 'query_timeout', reason: `evaluation exceeded ${timeoutMs} ms and its process was killed` });
      if (oversized) return finish({ ...base, verdict: 'query_error', reason: 'evaluation output exceeded 1 MiB' });
      if (code !== 0) return finish({ ...base, verdict: 'query_error', reason: `isolated evaluator exited with ${code}: ${stderr.slice(0, 200)}` });
      try {
        finish(JSON.parse(stdout));
      } catch {
        finish({ ...base, verdict: 'query_error', reason: 'invalid evaluator output' });
      }
    });
    child.stdin.on('error', () => {});
    child.stdin.end(JSON.stringify({ rows, caseId: c.id, sql, modelError }));
  });
}
