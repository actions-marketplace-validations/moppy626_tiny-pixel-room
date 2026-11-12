// キャラクターの絵を、1 ドットを 1 マスにした SVG にする。
// サイトのキャラクター選び (main.mjs) と、サイトのアイコン (scripts/build-site.mjs) で使う。
import { PALETTE } from '../src/sprites.mjs';

export function spriteSvg(rows, dot = 4) {
  const paths = {};
  rows.forEach((row, y) => {
    Array.from(row).forEach((key, x) => {
      if (key !== '.') (paths[key] ??= []).push(`M${x} ${y}h1v1h-1z`);
    });
  });
  const width = rows[0].length;
  const height = rows.length;
  const body = Object.entries(paths).map(([key, d]) => `<path fill="${PALETTE[key]}" d="${d.join('')}"/>`).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width * dot}" height="${height * dot}" shape-rendering="crispEdges" aria-hidden="true">${body}</svg>`;
}
