// Child process for safe-scoring.mjs: reads one job from stdin, prints one verdict as JSON.
import { cases } from './cases.mjs';
import { evaluateSql } from './scoring.mjs';

let input = '';
for await (const part of process.stdin) input += part;
const job = JSON.parse(input);
const c = cases.find((x) => x.id === job.caseId);
if (!c) throw new Error('unknown case');
console.log(JSON.stringify(evaluateSql(job.rows, c, job.sql, { error: job.modelError })));
