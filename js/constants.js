// 카탄 기본판 규칙 상수

export const RESOURCES = ['wood', 'brick', 'wool', 'grain', 'ore'];

export const RESOURCE_NAMES = {
  wood: '나무',
  brick: '벽돌',
  wool: '양모',
  grain: '밀',
  ore: '철광석',
};

// 지형 → 생산 자원
export const TERRAIN_RESOURCE = {
  forest: 'wood',
  hills: 'brick',
  pasture: 'wool',
  fields: 'grain',
  mountains: 'ore',
  desert: null,
};

export const TERRAIN_NAMES = {
  forest: '숲',
  hills: '언덕',
  pasture: '목초지',
  fields: '들판',
  mountains: '산',
  desert: '사막',
};

export const TERRAIN_COUNTS = {
  forest: 4,
  pasture: 4,
  fields: 4,
  hills: 3,
  mountains: 3,
  desert: 1,
};

export const NUMBER_TOKENS = [2, 3, 3, 4, 4, 5, 5, 6, 6, 8, 8, 9, 9, 10, 10, 11, 11, 12];

// 주사위 합이 나올 경우의 수 (확률 점 개수)
export const PIPS = { 2: 1, 3: 2, 4: 3, 5: 4, 6: 5, 8: 5, 9: 4, 10: 3, 11: 2, 12: 1 };

export const COSTS = {
  road: { wood: 1, brick: 1 },
  settlement: { wood: 1, brick: 1, wool: 1, grain: 1 },
  city: { grain: 2, ore: 3 },
  devCard: { wool: 1, grain: 1, ore: 1 },
};

export const PIECE_LIMITS = { road: 15, settlement: 5, city: 4 };

export const BANK_PER_RESOURCE = 19;

export const DEV_DECK = {
  knight: 14,
  victoryPoint: 5,
  roadBuilding: 2,
  yearOfPlenty: 2,
  monopoly: 2,
};

export const DEV_NAMES = {
  knight: '기사',
  victoryPoint: '승리 점수',
  roadBuilding: '도로 건설',
  yearOfPlenty: '풍년',
  monopoly: '독점',
};

export const DEV_DESCRIPTIONS = {
  knight: '도둑을 옮기고, 그 지형에 건물이 있는 상대에게서 자원 카드 1장을 빼앗습니다.',
  victoryPoint: '승리 점수 1점. 공개하지 않아도 점수에 포함됩니다.',
  roadBuilding: '도로 2개를 무료로 건설합니다.',
  yearOfPlenty: '은행에서 원하는 자원 카드 2장을 가져옵니다.',
  monopoly: '자원 1종류를 선언하면, 모든 상대가 그 자원을 전부 당신에게 줍니다.',
};

// 항구: 범용 3:1 4개, 자원별 2:1 5개
export const PORT_TYPES = ['generic', 'generic', 'generic', 'generic', 'wood', 'brick', 'wool', 'grain', 'ore'];

export const WIN_POINTS = 10;
export const LONGEST_ROAD_MIN = 5;
export const LARGEST_ARMY_MIN = 3;

export const PLAYER_COLORS = [
  { id: 'red', name: '빨강', main: '#e04848', light: '#f88c7c', dark: '#982030' },
  { id: 'blue', name: '파랑', main: '#3c74e0', light: '#7cacf8', dark: '#203c98' },
  { id: 'orange', name: '주황', main: '#f08c20', light: '#fcc060', dark: '#a85410' },
  { id: 'white', name: '하양', main: '#ece8e0', light: '#ffffff', dark: '#9c98a8' },
];
