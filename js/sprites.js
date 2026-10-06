// 도트 아트 스프라이트 정의 ('.' = 투명)

export const PAL = {
  outline: '#2a2018',
  tokenFill: '#f2e3b3',
  tokenEdge: '#6a4a24',
  tokenText: '#2a2018',
  tokenRed: '#c41e1e',
  dock: '#8a5a2a',
  dockDark: '#4a2e14',
  sea: '#2b5fae',
  seaDark: '#244f94',
  seaLight: '#5d93dc',
  foam: '#9cc8f4',
  highlight: '#fff6a0',
};

export const TERRAIN_COLORS = {
  forest: ['#2c6a2e', '#357a34', '#24582a'],
  pasture: ['#7cc04c', '#8cd05a', '#6aac40'],
  fields: ['#dcb04a', '#e8c462', '#c89a38'],
  hills: ['#bc6a3c', '#cc7c4c', '#a45a30'],
  mountains: ['#8c8c9a', '#9c9caa', '#76768a'],
  desert: ['#e4cc92', '#ecd8a4', '#d4b87c'],
};

const TREE = {
  map: [
    '...d...',
    '..dGd..',
    '..dgd..',
    '.dGggd.',
    '.dgggd.',
    'dGgggGd',
    'dgggggd',
    '.ddtdd.',
    '...t...',
  ],
  pal: { d: '#143a18', G: '#6cbc54', g: '#3e923c', t: '#6b4226' },
};

const SHEEP = {
  map: [
    '.wWWw....',
    'wWWWWwkk.',
    'wWWWWWkek',
    'wwWWWwkk.',
    '.wwwww...',
    '.k.k.k...',
  ],
  pal: { w: '#c8c8bc', W: '#fafaf2', k: '#2c2c30', e: '#fafaf2' },
};

const WHEAT = {
  map: [
    '.y.y.',
    'yYyYy',
    '.yYy.',
    'yYyYy',
    '.yYy.',
    '..g..',
    '..g..',
  ],
  pal: { y: '#a8741c', Y: '#fbe07a', g: '#7a6a24' },
};

const BRICKS = {
  map: [
    '..kkkkk..',
    '..kRrRk..',
    'kkkkkkkkk',
    'kRrkRrkRk',
    'kkkkkkkkk',
  ],
  pal: { k: '#4a1c10', R: '#e8784a', r: '#b4462a' },
};

const MOUNTAIN = {
  map: [
    '.....w.....',
    '....wwG....',
    '...wGGgG...',
    '..GGgGggg..',
    '.GgggGgggg.',
    'GggggggGggg',
  ],
  pal: { w: '#f4f4fc', G: '#bcbcc8', g: '#5c5c6c' },
};

const CACTUS = {
  map: [
    '..c..',
    'c.c..',
    'c.c.c',
    'ccccc',
    '..cc.',
    '..c..',
  ],
  pal: { c: '#4a8a3a' },
};

const DUNE = {
  map: ['..sss..', '.s...s.', 's.....s'],
  pal: { s: '#c4a468' },
};

const TUFT = {
  map: ['g.g', '.g.'],
  pal: { g: '#4e9a34' },
};

export const TERRAIN_DECOR = {
  forest: { sprites: [TREE], count: 6 },
  pasture: { sprites: [SHEEP, TUFT, SHEEP, TUFT], count: 5 },
  fields: { sprites: [WHEAT], count: 8 },
  hills: { sprites: [BRICKS], count: 4 },
  mountains: { sprites: [MOUNTAIN], count: 4 },
  desert: { sprites: [CACTUS, DUNE, DUNE], count: 5 },
};

// 플레이어 말 (m=주색, l=밝은색, d=어두운색)
export const SETTLEMENT = {
  map: [
    '.....k.....',
    '....kmk....',
    '...kmmdk...',
    '..kmmmmdk..',
    '.kmmmmmmdk.',
    'kkkkkkkkkkk',
    '.klllllldk.',
    '.klwlllwdk.',
    '.klwllkkdk.',
    '.kllllkkdk.',
    '.kkkkkkkkk.',
  ],
  pal: { k: '#1a1410', w: '#3a2a1a' },
};

export const CITY = {
  map: [
    '...k...........',
    '..kmk..........',
    '.kmmdk.........',
    'kmmmmdk........',
    'kkkkkkk........',
    'klllldk...k....',
    'klwwldk..kmk...',
    'klwwldk.kmmdk..',
    'klllldkkmmmmdk.',
    'klllldkmmmmmmdk',
    'klwwldkkkkkkkkk',
    'klwwldklllllldk',
    'klllldkllwwlldk',
    'kkkkkkkkkkkkkkk',
  ],
  pal: { k: '#1a1410', w: '#3a2a1a' },
};

export const ROBBER = {
  map: [
    '..kkk..',
    '.kgggk.',
    '.kgGgk.',
    '.kgggk.',
    '..kgk..',
    '.kgggk.',
    'kgGgggk',
    'kgGgggk',
    'kgggggk',
    '.kgggk.',
    'kkkkkkk',
  ],
  pal: { k: '#101014', g: '#484852', G: '#80808c' },
};

// UI 아이콘 9x9
export const ICONS = {
  wood: {
    map: [
      '....d....',
      '...dGd...',
      '..dGggd..',
      '..dgggd..',
      '.dGgggGd.',
      '.dgggggd.',
      'dgggggggd',
      '.dddtddd.',
      '....t....',
    ],
    pal: TREE.pal,
  },
  brick: {
    map: [
      '.........',
      '.........',
      'kkkkkkkkk',
      'kRRrkRRrk',
      'kkkkkkkkk',
      'kRrkRRrkk',
      'kkkkkkkkk',
      'kRRrkRRrk',
      'kkkkkkkkk',
    ],
    pal: BRICKS.pal,
  },
  wool: {
    map: [
      '.........',
      '..wWWw...',
      '.wWWWWwkk',
      'wWWWWWkek',
      'wWWWWWwkk',
      'wwWWWWw..',
      '.wwwwww..',
      '.k.k.k.k.',
      '.........',
    ],
    pal: SHEEP.pal,
  },
  grain: {
    map: [
      '.y..y..y.',
      'yYyyYyyYy',
      '.yYy.yYy.',
      'yYyyYyyYy',
      '.yYy.yYy.',
      '..g..g..g',
      '..g.g..g.',
      '...ggg...',
      '....g....',
    ],
    pal: WHEAT.pal,
  },
  ore: {
    map: [
      '.........',
      '...kkk...',
      '..kGGgk..',
      '.kGsGggk.',
      'kGGGgggk.',
      'kGgggggk.',
      'kgggggggk',
      '.kkkkkkk.',
      '.........',
    ],
    pal: { k: '#2c2c38', G: '#b4b4c4', g: '#6c6c80', s: '#f4f4ff' },
  },
  knight: {
    map: [
      '...kkk...',
      '..kGGGk..',
      '.kGGGGgk.',
      '.kkkkkkk.',
      '.kGrkrgk.',
      '.kGGGggk.',
      '..kGggk..',
      '.kkGggkk.',
      'kGGGggggk',
    ],
    pal: { k: '#1c1c28', G: '#c8c8d8', g: '#7c7c90', r: '#e03c3c' },
  },
  victoryPoint: {
    map: [
      '....y....',
      '...yYy...',
      'yyyYYYyyy',
      '.yYYYYYy.',
      '..yYYYy..',
      '..yYyYy..',
      '.yYy.yYy.',
      '.yy...yy.',
      '.........',
    ],
    pal: { y: '#b0801c', Y: '#fcd84c' },
  },
  roadBuilding: {
    map: [
      '.......kk',
      '......kmk',
      '.....kmk.',
      '....kmk..',
      '...kmk...',
      '..kmk....',
      '.kmk.....',
      'kmk......',
      'kk.......',
    ],
    pal: { k: '#3a2410', m: '#c88a4a' },
  },
  yearOfPlenty: {
    map: [
      '....y....',
      '....y....',
      '..y.Y.y..',
      '...YYY...',
      'yyYYwYYyy',
      '...YYY...',
      '..y.Y.y..',
      '....y....',
      '....y....',
    ],
    pal: { y: '#d8a020', Y: '#fce47c', w: '#ffffff' },
  },
  monopoly: {
    map: [
      '...kkk...',
      '....k....',
      '..kkkkk..',
      '.kYYYYyk.',
      'kYYkkYYyk',
      'kYYkYYYyk',
      'kYYYkkYyk',
      '.kYYYYyk.',
      '..kkkkk..',
    ],
    pal: { k: '#4a3010', Y: '#f0c040', y: '#b08020' },
  },
  cards: {
    map: [
      '...kkkkk.',
      '...kWWWk.',
      '.kkkkkWk.',
      '.kWWWkWk.',
      '.kWyWkWk.',
      '.kWWWkkk.',
      '.kWWWk...',
      '.kkkkk...',
      '.........',
    ],
    pal: { k: '#2a2018', W: '#fff8e4', y: '#c8902a' },
  },
  devBack: {
    map: [
      'kkkkkkkkk',
      'kppppPppk',
      'kpPppppPk',
      'kppkkkppk',
      'kpPk?kPpk',
      'kppkkkppk',
      'kPppppPpk',
      'kppPppppk',
      'kkkkkkkkk',
    ],
    pal: { k: '#2a1a40', p: '#6a4aa8', P: '#9c7ce0', '?': '#fce47c' },
  },
  dice: {
    map: [
      'kkkkkkkkk',
      'kwwwwwwwk',
      'kwkwwwwwk',
      'kwwwwwwwk',
      'kwwwkwwwk',
      'kwwwwwwwk',
      'kwwwwwkwk',
      'kwwwwwwwk',
      'kkkkkkkkk',
    ],
    pal: { k: '#2a2018', w: '#fafaf2' },
  },
};

// 3x5 숫자 글꼴
export const DIGITS = {
  0: ['111', '101', '101', '101', '111'],
  1: ['010', '110', '010', '010', '111'],
  2: ['111', '001', '111', '100', '111'],
  3: ['111', '001', '111', '001', '111'],
  4: ['101', '101', '111', '001', '001'],
  5: ['111', '100', '111', '001', '111'],
  6: ['111', '100', '111', '101', '111'],
  7: ['111', '001', '001', '010', '010'],
  8: ['111', '101', '111', '101', '111'],
  9: ['111', '101', '111', '001', '111'],
  ':': ['0', '1', '0', '1', '0'],
  '?': ['111', '001', '011', '000', '010'],
};

export function drawSprite(ctx, sprite, x, y, colors = {}) {
  const { map, pal } = sprite;
  for (let r = 0; r < map.length; r++) {
    const row = map[r];
    for (let c = 0; c < row.length; c++) {
      const ch = row[c];
      if (ch === '.') continue;
      ctx.fillStyle = colors[ch] || pal[ch] || '#ff00ff';
      ctx.fillRect(x + c, y + r, 1, 1);
    }
  }
}

export function spriteSize(sprite) {
  return { w: sprite.map[0].length, h: sprite.map.length };
}

export function textWidth(text, scale = 1) {
  let w = 0;
  for (const ch of String(text)) w += ((DIGITS[ch]?.[0].length ?? 3) + 1) * scale;
  return w - scale;
}

export function drawText(ctx, text, x, y, color, scale = 1) {
  ctx.fillStyle = color;
  let cx = x;
  for (const ch of String(text)) {
    const glyph = DIGITS[ch];
    if (!glyph) {
      cx += 4 * scale;
      continue;
    }
    glyph.forEach((row, r) => {
      for (let c = 0; c < row.length; c++) if (row[c] === '1') ctx.fillRect(cx + c * scale, y + r * scale, scale, scale);
    });
    cx += (glyph[0].length + 1) * scale;
  }
}

// 아이콘을 확대된 PNG 데이터 URL로 변환 (DOM용)
const iconCache = new Map();
export function iconURL(name, colors) {
  const key = name + JSON.stringify(colors || {});
  if (iconCache.has(key)) return iconCache.get(key);
  const sprite = ICONS[name] || { settlement: SETTLEMENT, city: CITY, robber: ROBBER }[name];
  const { w, h } = spriteSize(sprite);
  const scale = 4;
  const c = document.createElement('canvas');
  c.width = w * scale;
  c.height = h * scale;
  const ctx = c.getContext('2d');
  ctx.scale(scale, scale);
  drawSprite(ctx, sprite, 0, 0, colors);
  const url = c.toDataURL();
  iconCache.set(key, url);
  return url;
}

export function pieceColors(color) {
  return { m: color.main, l: color.light, d: color.dark };
}
