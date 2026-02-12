export const GAME_CONFIG = Object.freeze({
  maxRounds: 8,
  roundDurationSec: 90,
  shopDurationSec: 15,
  scoreToWin: 3,
  bossAttackIntervalSec: 0.4,
  frenzyAttackSpeedBonus: 0.25,
  frenzyAttackDamageBonus: 0.1,
  frenzyTriggerRound: 4,
  frenzyHpThreshold: 0.5,
  baseAttackInterval: 0.5,
  baseAttackSpeed: 2.0,
  maxGold: 25000,
  moveSpeed: 360,
  arena: {
    width: 1920,
    height: 1080,
    playerMinX: 120,
    playerMaxX: 1800,
    playerMinY: 430,
    playerMaxY: 1000,
    bossX: 960,
    bossY: 190,
    bossRadius: 170,
  },
  /** 몬스터 기준 바닥 3구역: [왼쪽, 가운데(내가), 오른쪽] - 각 캐릭터 침범 불가 */
  playerZones: [
    { minX: 680, maxX: 1240 },
    { minX: 120, maxX: 680 },
    { minX: 1240, maxX: 1800 },
  ],
});

export const ROUND_DATA = Object.freeze({
  1: { smite: 500, bossDmg: 90 },
  2: { smite: 500, bossDmg: 105 },
  3: { smite: 1000, bossDmg: 120 },
  4: { smite: 1000, bossDmg: 140 },
  5: { smite: 1500, bossDmg: 155 },
  6: { smite: 1500, bossDmg: 170 },
  7: { smite: 2000, bossDmg: 185 },
  8: { smite: 2000, bossDmg: 200 },
});

export const BOSS_HP_TABLE = Object.freeze({
  1: 5000,
  2: 8000,
  3: 11000,
  4: 15000,
  5: 19000,
  6: 23000,
  7: 27000,
  8: 32000,
});

export const PATTERN_TABLE = Object.freeze([
  { type: "Bind", chance: 15 },
  { type: "Swipe", chance: 20 },
  { type: "Projectile", chance: 25 },
  { type: "AoE", chance: 20 },
  { type: "Ink", chance: 20 },
]);

export const BASE_STAT = Object.freeze({
  hp: 3000,
  atk: 100,
  magic: 80,
  armor: 20,
  regen: 25,
});

export const GOLD_VALUE = Object.freeze({
  atk: 100,
  magic: 110,
  armor: 130,
  cdr: 150,
  atkspd: 120,
});

export const ITEM_CATALOG = Object.freeze([
  {
    id: "iron_blade",
    name: "강철 검",
    slot: "normal",
    cost: 1600,
    stats: { atk: 24 },
    description: "공격력 +24",
  },
  {
    id: "arcane_rod",
    name: "비전 완드",
    slot: "normal",
    cost: 1700,
    stats: { magic: 22 },
    description: "마력 +22",
  },
  {
    id: "guard_plate",
    name: "수호 판금",
    slot: "normal",
    cost: 1800,
    stats: { armor: 18 },
    description: "방어력 +18",
  },
  {
    id: "rapid_gloves",
    name: "속사 장갑",
    slot: "normal",
    cost: 2000,
    stats: { atkspd: 0.18 },
    description: "공격속도 +18%",
  },
  {
    id: "tide_boots",
    name: "조류 장화",
    slot: "boots",
    cost: 1500,
    stats: { moveSpeed: 60, atkspd: 0.06 },
    description: "이동속도 +60, 공격속도 +6%",
  },
  {
    id: "veteran_aegis",
    name: "노장의 전성기 방패",
    slot: "ultimate",
    cost: 4300,
    stats: { armor: 35 },
    passive: { bindImmune: true },
    description: "방어력 +35, Bind 면역",
  },
  {
    id: "leviathan_core",
    name: "레비아탄 코어",
    slot: "ultimate",
    cost: 4700,
    stats: { atk: 35, magic: 35 },
    refund: 600,
    description: "공격력/마력 +35, 구매 즉시 600G 환급",
  },
]);

export const CHARACTER_POOL = Object.freeze([
  { id: "state", name: "상태 전환형", description: "공격/방어 태세를 주기적으로 교대" },
  { id: "wand", name: "마법봉", description: "공격 시 스택을 쌓아 누적 강화" },
  { id: "boomerang", name: "부메랑", description: "점수 획득 시 전투력이 크게 성장" },
  { id: "bow", name: "활", description: "공격속도를 평타 데미지로 전환" },
  { id: "crossbow", name: "석궁", description: "리듬 사격과 이동 기반 공격력 전환" },
]);
