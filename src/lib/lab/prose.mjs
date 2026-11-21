// Build-time tidying of a Lab page's rendered Markdown, so every part of it reads on a 375 px phone.
//
// wrapTables() puts each <table> in a container that scrolls sideways. The site clips sideways
// overflow on html and body at phone widths, so a table wider than the screen would otherwise lose
// its right-hand columns with no way to reach them. The container is a focusable, labelled region
// so it can also be scrolled from the keyboard.

export const TABLE_SCROLL_CLASS = 'lab-table-scroll';

const OPEN = `<div class="${TABLE_SCROLL_CLASS}" role="region" aria-label="Table, scrolls sideways" tabindex="0">`;

export function wrapTables(html) {
  let depth = 0;
  const out = String(html).replace(/<table\b[^>]*>|<\/table>/g, (tag) => {
    if (tag.startsWith('</')) {
      depth -= 1;
      if (depth < 0) throw new Error('A </table> has no opening <table> in the Lab page');
      return `${tag}</div>`;
    }
    depth += 1;
    if (depth > 1) throw new Error('Nested tables are not supported on Lab pages');
    return `${OPEN}${tag}`;
  });
  if (depth !== 0) throw new Error('A <table> is not closed in the Lab page');
  return out;
}
