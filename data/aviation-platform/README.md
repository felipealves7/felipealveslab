# aviation-platform

The record behind the loader-scan prototype on `/case-studies/aviation-platform`: where the Figma prototype
lives, how it is embedded, the rules and acceptance criteria shown beside it, and the colours its contrast
figures are computed from. The four screen images are in `public/assets/case-studies/aviation/`.

## Source and licence

- **Source:** Felipe Alves's own Figma file "BRS loader scan — MVP prototype",
  https://www.figma.com/design/FO8nwtyO1PRU0SWXo9VEAY. The screens are a reconstruction for this page,
  not screens of the real system. The process and the checks are simplified.
- **Licence:** the screens and text are Felipe's own work and part of the site's written content, which the
  code's MIT licence does not cover (see the repository `README.md`).
- **Checked:** 22 November 2026, signed out. Figma's oEmbed endpoint returned the file's title and a
  thumbnail, and the embed URL loaded and was clicked through in headless Chrome. Embed parameters follow
  https://developers.figma.com/docs/embeds/embed-figma-prototype, opened the same day.
- **Synthetic:** yes. Flights, tags, units and the airline code `ZZ` are invented.
- **Personal data:** none. **Employer data:** none.

## Files

| File | What it is |
| --- | --- |
| `prototype.json` | Figma URLs and the origins the embed loads from, the page label, the screen images with captions and alt text, the rules table, the acceptance criteria and the screen colours |

## Fields in `prototype.json`

| Field | Meaning |
| --- | --- |
| `checked`, `how` | Date and method of the signed-out check |
| `synthetic`, `label` | Always `true`; the label shown on the page |
| `figma.protoUrl` | Opens the prototype on figma.com at its first screen |
| `figma.embedUrl` | The iframe source, loaded only after a click on wide screens |
| `figma.frameOrigins` | Origins the embed loads from; `public/_headers` allows them in `frame-src` |
| `colours` | Hex colours of the screens; the page computes contrast ratios from them |
| `screens` | Image path, caption and alt text for each still |
| `rules` | What the scan finds and what the loader sees, with no numbering |
| `criteria` | Acceptance criteria as examples, as given / when / then |
