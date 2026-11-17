import { defineCollection } from 'astro:content';
import { z } from 'astro/zod';
import { glob } from 'astro/loaders';

// Every Lab experiment is one Markdown file. A page that breaks this schema fails the build,
// so a malformed page cannot go live. Files starting with "_" (the template) are ignored.
// Career labs name a lane. Pages in The Human Variable series (series: human-variable) do not.
const lab = defineCollection({
  loader: glob({ pattern: '**/[^_]*.md', base: './src/content/lab' }),
  schema: z.object({
    title: z.string().min(5),
    type: z.enum(['production-like demo', 'research study', 'experiment']),
    lane: z.enum(['data engineering', 'conversational BI and evaluation', 'wildcard']).optional(),
    series: z.enum(['human-variable']).optional(),
    status: z.enum(['building', 'live', 'retired']),
    question: z.string().min(15),
    payer: z.string().min(5),
    dataSource: z.string().min(5),
    dataLicence: z.string().min(2),
    dataFreshness: z.coerce.date(),
    synthetic: z.boolean(),
    limits: z.string().min(40),
    runningCost: z.string().min(2),
    builtBy: z.url(),
    published: z.coerce.date().optional(),
  }).refine((d) => d.series === 'human-variable' || d.lane !== undefined, {
    message: 'lane is required unless series is human-variable',
    path: ['lane'],
  }),
});

export const collections = { lab };
