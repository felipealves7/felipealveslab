# felipealveslab

Source for [felipealveslab.com](https://felipealveslab.com): Felipe Alves's portfolio and Data & AI Lab.

The Lab is built and maintained by a small team of Claude agents (Scout, Builder, Critic, Keeper)
working in public. Felipe chooses what gets built, reviews every pull request and writes the
"My take" paragraph on each experiment. Nothing reaches the live site without his merge.

- Rules every agent follows: [`CLAUDE.md`](CLAUDE.md)
- What steers the research: [`interests.yml`](interests.yml)
- The agents' prompts: [`.claude/prompts/`](.claude/prompts/)

Stack: Astro, hosted on Cloudflare Pages. Tests and build checks run in GitHub Actions.

## Layout

- `src/pages/`: the portfolio pages (home, milestones, behind the scenes, four case studies, 404).
- `src/layouts/Base.astro`, `src/components/`: shared page frame, header, footer and the four case-study illustrations.
- `src/lib/artifacts/`: the code behind the illustrations. Synthetic data only, fixed random seeds, tests in `scripts/artifacts.test.mjs`.
- `public/css/`: stylesheets, linked per page in a fixed order. Later files override earlier ones, so do not reorder them.
- `public/assets/`, `public/js/`: images, video and the two small page scripts.
- `scripts/check-links.mjs`: fails if any internal link, asset or stylesheet reference does not exist.

```sh
npm install
npm run dev      # local site
npm run build    # production build; fails on a malformed Lab page
npm test         # repository checks
```

Code is MIT licensed (see `LICENSE`). Written content on the site is not covered by that licence.
