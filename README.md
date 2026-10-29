# felipealveslab

Source for [felipealveslab.com](https://felipealveslab.com): Felipe Alves's portfolio and Data & AI Lab.

The Lab is built and maintained by a small team of Claude agents (Scout, Builder, Critic, Keeper)
working in public. Felipe chooses what gets built, reviews every pull request and writes the
"My take" paragraph on each experiment. Nothing reaches the live site without his merge.

- Rules every agent follows: [`CLAUDE.md`](CLAUDE.md)
- What steers the research: [`interests.yml`](interests.yml)
- The agents' prompts: [`.claude/prompts/`](.claude/prompts/)

Stack: Astro, hosted on Cloudflare Pages. Tests and build checks run in GitHub Actions.

```sh
npm install
npm run dev      # local site
npm run build    # production build; fails on a malformed Lab page
npm test         # repository checks
```

Code is MIT licensed (see `LICENSE`). Written content on the site is not covered by that licence.
