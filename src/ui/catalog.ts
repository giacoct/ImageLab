/**
 * How the tools are presented: in groups in the navigation's Tools menu, and
 * in a curated order on the home page, where some cards are wide. Tools
 * missing from these lists are still shown (at the end), so adding a tool to
 * app/tools.ts is enough for it to appear.
 */

import { TOOLS, type Tool } from '../app/tools';

interface Group {
  title: string;
  tools: Tool[];
}

const GROUPS: [string, string[]][] = [
  ['Edit', ['resize', 'scale', 'adjust', 'remove-background', 'margin']],
  ['Convert and clean', ['convert', 'compress', 'strip-metadata', 'merge']],
  ['Smart tools', ['upscale', 'convert-svg', 'ocr']],
];

/** The home page's cards, in order; wide ones span two columns. */
const SHOWCASE: [string, boolean][] = [
  ['resize', true],
  ['adjust', false],
  ['remove-background', false],
  ['margin', false],
  ['scale', false],
  ['merge', true],
  ['convert', false],
  ['compress', false],
  ['strip-metadata', true],
  ['upscale', true],
  ['convert-svg', false],
  ['ocr', false],
];

function byId(id: string): Tool | undefined {
  return TOOLS.find((tool) => tool.id === id);
}

export const TOOL_GROUPS: Group[] = (() => {
  const groups = GROUPS.map(([title, ids]) => ({
    title,
    tools: ids.map(byId).filter((tool): tool is Tool => tool !== undefined),
  }));
  const listed = new Set(GROUPS.flatMap(([, ids]) => ids));
  const rest = TOOLS.filter((tool) => !listed.has(tool.id));
  return rest.length ? [...groups, { title: 'More', tools: rest }] : groups;
})();

export const SHOWCASE_TOOLS: { tool: Tool; wide: boolean }[] = (() => {
  const shown = SHOWCASE.flatMap(([id, wide]) => {
    const tool = byId(id);
    return tool ? [{ tool, wide }] : [];
  });
  const listed = new Set(SHOWCASE.map(([id]) => id));
  return [
    ...shown,
    ...TOOLS.filter((tool) => !listed.has(tool.id)).map((tool) => ({ tool, wide: false })),
  ];
})();
