import {
  BASE_STAT,
  BOSS_HP_TABLE,
  CHARACTER_POOL,
  GAME_CONFIG,
  ITEM_CATALOG,
  PATTERN_TABLE,
  ROUND_DATA,
} from "./constants.js";
import { createCharacter } from "./characters.js";

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function normalizeVector(x, y) {
  const len = Math.hypot(x, y);
  if (len <= 0.0001) {
    return { x: 0, y: 0 };
  }
  return { x: x / len, y: y / len };
}

function weightedPick(table, random = Math.random) {
  const total = table.reduce((sum, item) => sum + item.chance, 0);
  let roll = random() * total;
  for (const item of table) {
    roll -= item.chance;
    if (roll <= 0) {
      return item.type;
    }
  }
  return table[table.length - 1].type;
}

function round2(value) {
  return Math.round(value * 100) / 100;
}

function calcReducedDamage(baseDamage, armor) {
  const reduction = armor / (armor + 100);
  const finalDamage = baseDamage * (1 - reduction);
  return Math.max(1, finalDamage);
}

function createEmptyItemStats() {
  return {
    atk: 0,
    magic: 0,
    armor: 0,
    atkspd: 0,
    moveSpeed: 0,
    bindImmune: false,
  };
}

function createPlayer(id, name, isBot, color, characterId) {
  return {
    id,
    name,
    color,
    isBot,
    characterId,
    character: createCharacter(characterId),
    characterState: {},
    baseStats: { ...BASE_STAT },
    itemStats: createEmptyItemStats(),
    inventory: {
      normal: [],
      boots: null,
      ultimate: null,
    },
    hp: BASE_STAT.hp,
    maxHp: BASE_STAT.hp,
    regen: BASE_STAT.regen,
    alive: true,
    score: 0,
    lastHitScore: 0,
    smiteScore: 0,
    scoreReachedAt: Number.POSITIVE_INFINITY,
    scoreArrivalOrder: Number.POSITIVE_INFINITY,
    gold: 3000,
    smiteUsed: false,
    attackIntent: true,
    inputMove: { x: 0, y: 0 },
    velocity: { x: 0, y: 0 },
    aim: { x: 0, y: -1 },
    manualAim: false,
    attackCooldown: 0,
    computedAtk: BASE_STAT.atk,
    computedMagic: BASE_STAT.magic,
    computedArmor: BASE_STAT.armor,
    computedAttackSpeed: GAME_CONFIG.baseAttackSpeed,
    computedAttackInterval: GAME_CONFIG.baseAttackInterval,
    computedMoveSpeed: GAME_CONFIG.moveSpeed,
    bindImmune: false,
    status: {
      bind: 0,
      ink: 0,
    },
    position: { x: 960, y: 840 },
    damageDoneThisRound: 0,
    skillBook: {
      q: { name: "Q", cooldown: 10, description: "" },
      w: { name: "W", cooldown: 14, description: "" },
      e: { name: "E", cooldown: 20, description: "" },
    },
    skillCooldowns: {
      q: 0,
      w: 0,
      e: 0,
    },
    botState: {
      targetX: 960,
      targetY: 780,
      moveTimer: 0,
      boughtInShop: false,
      skillThinkTimer: 0.8,
    },
  };
}

export class GameServer {
  constructor() {
    this.serverTime = 0;
    this.commandCounter = 0;
    this.commandQueue = [];
    this.feedCounter = 0;
    this.feed = [];
    this.effects = [];
    this.phase = "battle";
    this.round = 1;
    this.phaseRemaining = GAME_CONFIG.roundDurationSec;
    this.roundEnded = false;
    this.winnerId = null;
    this.winnerReason = "";
    this.lastPatternMessage = "패턴 대기";
    this.roundDamage = {};
    this.roundKillInfo = null;
    this.localPlayerId = "P1";
    this.players = [
      createPlayer("P1", "당신", false, "#4FD1FF", "state"),
      createPlayer("P2", "AI 루나", true, "#FFCF5A", "wand"),
      createPlayer("P3", "AI 카이", true, "#FF7AA8", "boomerang"),
    ];

    this.players.forEach((player) => this.rebuildSkillBook(player, true));

    this.spawnPlayers();
    this.startRound(1);
    this.pushFeed("가로 화면 전용 미니게임이 시작되었습니다.");
  }

  pushFeed(message) {
    this.feed.unshift({
      id: ++this.feedCounter,
      t: round2(this.serverTime),
      message,
    });
    if (this.feed.length > 9) {
      this.feed.length = 9;
    }
  }

  queueCommand(command) {
    const arrival = this.serverTime + (command.networkLagMs ?? 0) / 1000;
    this.commandQueue.push({
      ...command,
      arrival,
      order: ++this.commandCounter,
    });
  }

  getPlayer(playerId) {
    return this.players.find((player) => player.id === playerId) ?? null;
  }

  spawnPlayers() {
    const spawnPoints = [
      { x: 760, y: 850 },
      { x: 960, y: 880 },
      { x: 1160, y: 850 },
    ];
    this.players.forEach((player, index) => {
      const point = spawnPoints[index] ?? spawnPoints[0];
      player.position.x = point.x;
      player.position.y = point.y;
      player.velocity.x = 0;
      player.velocity.y = 0;
      player.inputMove.x = 0;
      player.inputMove.y = 0;
      player.aim.x = 0;
      player.aim.y = -1;
      player.manualAim = false;
    });
  }

  buildBoss(round) {
    const roundInfo = ROUND_DATA[round];
    return {
      maxHp: BOSS_HP_TABLE[round],
      hp: BOSS_HP_TABLE[round],
      baseDamage: roundInfo.bossDmg,
      smiteDamage: roundInfo.smite,
      frenzy: false,
      attackTimer: GAME_CONFIG.bossAttackIntervalSec,
      patternTimer: 5,
    };
  }

  startRound(round) {
    this.round = round;
    this.phase = "battle";
    this.phaseRemaining = GAME_CONFIG.roundDurationSec;
    this.roundEnded = false;
    this.roundKillInfo = null;
    this.roundDamage = {};
    this.lastPatternMessage = "패턴 대기";
    this.effects.length = 0;
    this.boss = this.buildBoss(round);

    this.spawnPlayers();

    this.players.forEach((player, index) => {
      player.alive = true;
      player.smiteUsed = false;
      player.attackIntent = true;
      player.status.bind = 0;
      player.status.ink = 0;
      player.damageDoneThisRound = 0;
      player.botState.boughtInShop = false;
      player.botState.skillThinkTimer = 0.6 + Math.random() * 0.5;
      player.attackCooldown = index * 0.07;
      player.character.onRoundStart(player, this);
      this.rebuildSkillBook(player, true);
      this.recomputePlayerStats(player);
      player.hp = player.maxHp;
      this.roundDamage[player.id] = 0;
    });

    this.pushFeed(`라운드 ${round} 시작! 보스 HP ${this.boss.maxHp}`);
  }

  startShopPhase() {
    this.phase = "shop";
    this.phaseRemaining = GAME_CONFIG.shopDurationSec;
    this.pushFeed("상점 페이즈 15초. 전투 중 구매는 불가합니다.");
  }

  recomputePlayerStats(player) {
    const itemStats = this.aggregateItemStats(player);
    player.itemStats = itemStats;
    const charBonus = player.character.getBonusStats(player, this);

    player.computedAtk = player.baseStats.atk + itemStats.atk + (charBonus.atkFlat ?? 0);
    player.computedMagic = player.baseStats.magic + itemStats.magic + (charBonus.magicFlat ?? 0);
    player.computedArmor = player.baseStats.armor + itemStats.armor + (charBonus.armorFlat ?? 0);
    player.regen = player.baseStats.regen;
    player.maxHp = player.baseStats.hp;
    player.computedAttackSpeed =
      GAME_CONFIG.baseAttackSpeed * (1 + itemStats.atkspd + (charBonus.atkSpeedBonus ?? 0));
    player.computedAttackSpeed = Math.max(0.7, player.computedAttackSpeed);
    player.computedAttackInterval = 1 / player.computedAttackSpeed;
    player.computedMoveSpeed =
      GAME_CONFIG.moveSpeed + itemStats.moveSpeed + (charBonus.moveSpeedFlat ?? 0);
    player.bindImmune = Boolean(itemStats.bindImmune || charBonus.bindImmune);
  }

  aggregateItemStats(player) {
    const stats = createEmptyItemStats();
    const allItems = [...player.inventory.normal];
    if (player.inventory.boots) {
      allItems.push(player.inventory.boots);
    }
    if (player.inventory.ultimate) {
      allItems.push(player.inventory.ultimate);
    }

    allItems.forEach((itemId) => {
      const item = ITEM_CATALOG.find((entry) => entry.id === itemId);
      if (!item) {
        return;
      }
      if (item.stats.atk) {
        stats.atk += item.stats.atk;
      }
      if (item.stats.magic) {
        stats.magic += item.stats.magic;
      }
      if (item.stats.armor) {
        stats.armor += item.stats.armor;
      }
      if (item.stats.atkspd) {
        stats.atkspd += item.stats.atkspd;
      }
      if (item.stats.moveSpeed) {
        stats.moveSpeed += item.stats.moveSpeed;
      }
      if (item.passive?.bindImmune) {
        stats.bindImmune = true;
      }
    });
    return stats;
  }

  rebuildSkillBook(player, resetCooldowns = false) {
    const definitions = player.character.getSkillDefinitions(player, this) ?? {};
    const fallback = {
      q: { name: "Q", cooldown: 10, description: "" },
      w: { name: "W", cooldown: 14, description: "" },
      e: { name: "E", cooldown: 20, description: "" },
    };

    player.skillBook = {
      q: { ...fallback.q, ...(definitions.q ?? {}) },
      w: { ...fallback.w, ...(definitions.w ?? {}) },
      e: { ...fallback.e, ...(definitions.e ?? {}) },
    };

    if (resetCooldowns) {
      player.skillCooldowns.q = 0;
      player.skillCooldowns.w = 0;
      player.skillCooldowns.e = 0;
    } else {
      player.skillCooldowns.q = clamp(player.skillCooldowns.q, 0, player.skillBook.q.cooldown);
      player.skillCooldowns.w = clamp(player.skillCooldowns.w, 0, player.skillBook.w.cooldown);
      player.skillCooldowns.e = clamp(player.skillCooldowns.e, 0, player.skillBook.e.cooldown);
    }
  }

  tickSkillCooldowns(player, dt) {
    player.skillCooldowns.q = Math.max(0, player.skillCooldowns.q - dt);
    player.skillCooldowns.w = Math.max(0, player.skillCooldowns.w - dt);
    player.skillCooldowns.e = Math.max(0, player.skillCooldowns.e - dt);
  }

  healPlayer(player, amount) {
    const before = player.hp;
    player.hp = clamp(player.hp + amount, 0, player.maxHp);
    return player.hp - before;
  }

  movePlayerBy(player, dx, dy) {
    player.position.x = clamp(
      player.position.x + dx,
      GAME_CONFIG.arena.playerMinX,
      GAME_CONFIG.arena.playerMaxX
    );
    player.position.y = clamp(
      player.position.y + dy,
      GAME_CONFIG.arena.playerMinY,
      GAME_CONFIG.arena.playerMaxY
    );
  }

  spawnSkillEffect(player, color = player.color) {
    this.effects.push({
      kind: "skillBurst",
      ttl: 0.28,
      from: { ...player.position },
      color,
    });
  }

  dealSkillDamage(player, amount, label = "스킬") {
    if (this.phase !== "battle" || this.boss.hp <= 0 || !player.alive) {
      return;
    }
    this.applyDamageToBoss(player, amount, "skill", this.commandCounter + 1);
    this.effects.push({
      kind: "skillShot",
      ttl: 0.2,
      from: { ...player.position },
      to: { x: GAME_CONFIG.arena.bossX, y: GAME_CONFIG.arena.bossY + 20 },
      color: player.color,
      label,
    });
  }

  tryCastSkill(player, slot) {
    if (this.phase !== "battle" || !player.alive || this.boss.hp <= 0) {
      return false;
    }
    if (!["q", "w", "e"].includes(slot)) {
      return false;
    }

    this.rebuildSkillBook(player, false);
    if (player.skillCooldowns[slot] > 0) {
      return false;
    }

    const casted = player.character.castSkill(slot, player, this);
    if (!casted) {
      return false;
    }

    player.skillCooldowns[slot] = player.skillBook[slot].cooldown;
    return true;
  }

  processCommands() {
    this.commandQueue.sort((a, b) => a.arrival - b.arrival || a.order - b.order);
    while (this.commandQueue.length > 0 && this.commandQueue[0].arrival <= this.serverTime + 1e-6) {
      const command = this.commandQueue.shift();
      const player = this.getPlayer(command.playerId);
      if (!player) {
        continue;
      }

      switch (command.type) {
        case "move":
          player.inputMove = normalizeVector(command.x ?? 0, command.y ?? 0);
          break;
        case "aim":
          player.aim = normalizeVector(command.x ?? 0, command.y ?? -1);
          player.manualAim = Boolean(command.manual);
          break;
        case "attack":
          player.attackIntent = Boolean(command.pressed);
          break;
        case "smite":
          this.trySmite(player, command.order);
          break;
        case "buy":
          this.tryBuyItem(player, command.itemId);
          break;
        case "character":
          this.tryChangeCharacter(player, command.characterId);
          break;
        case "skill":
          this.tryCastSkill(player, command.slot);
          break;
        default:
          break;
      }
    }
  }

  tryChangeCharacter(player, characterId) {
    const allowed = this.phase === "shop" || (this.round === 1 && this.serverTime < 4);
    if (!allowed) {
      return;
    }
    if (!CHARACTER_POOL.some((entry) => entry.id === characterId)) {
      return;
    }

    player.characterId = characterId;
    player.character = createCharacter(characterId);
    player.characterState = {};
    player.character.onRoundStart(player, this);
    this.rebuildSkillBook(player, true);
    this.recomputePlayerStats(player);
    this.pushFeed(`${player.name} 캐릭터 변경: ${player.character.name}`);
  }

  tryBuyItem(player, itemId) {
    if (this.phase !== "shop") {
      return false;
    }
    const item = ITEM_CATALOG.find((entry) => entry.id === itemId);
    if (!item) {
      return false;
    }
    if (player.gold < item.cost) {
      return false;
    }

    if (item.slot === "normal" && player.inventory.normal.length >= 4) {
      return false;
    }
    if (item.slot === "boots" && player.inventory.boots) {
      return false;
    }
    if (item.slot === "ultimate" && player.inventory.ultimate) {
      return false;
    }

    player.gold -= item.cost;
    if (item.slot === "normal") {
      player.inventory.normal.push(item.id);
    } else if (item.slot === "boots") {
      player.inventory.boots = item.id;
    } else if (item.slot === "ultimate") {
      player.inventory.ultimate = item.id;
    }

    if (item.refund) {
      player.gold += item.refund;
      this.pushFeed(`${player.name} ${item.name} 구매 환급 +${item.refund}G`);
    }

    player.gold = clamp(player.gold, 0, GAME_CONFIG.maxGold);
    this.recomputePlayerStats(player);
    this.pushFeed(`${player.name} ${item.name} 구매`);
    return true;
  }

  runBotShop(player) {
    if (!player.isBot || this.phase !== "shop" || player.botState.boughtInShop) {
      return;
    }
    const preferredItems = ["tide_boots", "rapid_gloves", "iron_blade", "guard_plate", "leviathan_core"];
    let attempts = 0;
    for (const itemId of preferredItems) {
      if (attempts >= 2) {
        break;
      }
      const success = this.tryBuyItem(player, itemId);
      if (success) {
        attempts += 1;
      }
    }
    player.botState.boughtInShop = true;
  }

  trySmite(player, arrivalOrder) {
    if (this.phase !== "battle" || this.boss.hp <= 0 || !player.alive || player.smiteUsed) {
      return;
    }

    player.smiteUsed = true;
    this.effects.push({
      kind: "smiteCast",
      ttl: 0.45,
      from: { ...player.position },
      to: { x: GAME_CONFIG.arena.bossX, y: GAME_CONFIG.arena.bossY },
      color: player.color,
    });
    this.pushFeed(`${player.name} 강타 사용`);

    if (this.boss.hp <= this.boss.smiteDamage) {
      const amount = this.boss.hp;
      this.applyDamageToBoss(player, amount, "smite", arrivalOrder);
      this.pushFeed(`${player.name} 강타 적중! +1점`);
    }
  }

  applyDamageToBoss(player, damage, source, arrivalOrder) {
    if (this.phase !== "battle" || this.boss.hp <= 0) {
      return;
    }

    const dealt = Math.max(1, damage);
    this.boss.hp = Math.max(0, this.boss.hp - dealt);
    this.roundDamage[player.id] += dealt;
    player.damageDoneThisRound += dealt;

    if (this.boss.hp <= 0.0001) {
      this.boss.hp = 0;
      this.roundKillInfo = {
        killerId: player.id,
        source,
      };

      if (source === "smite") {
        this.awardScore(player, "smite", arrivalOrder);
      } else {
        this.awardScore(player, "lastHit", arrivalOrder);
      }

      this.endBattleRound("bossDown");
    }
  }

  awardScore(player, kind, arrivalOrder) {
    if (kind === "smite") {
      player.smiteScore += 1;
    } else {
      player.lastHitScore += 1;
      this.pushFeed(`${player.name} 막타 성공! +1점`);
    }
    player.score = player.lastHitScore + player.smiteScore;
    player.scoreReachedAt = this.serverTime;
    player.scoreArrivalOrder = arrivalOrder ?? this.commandCounter;
    player.character.onScoreChanged(player, kind, this);

    if (player.score >= GAME_CONFIG.scoreToWin) {
      const candidates = this.players.filter((entry) => entry.score >= GAME_CONFIG.scoreToWin);
      const winner = this.resolveTieWinner(candidates);
      if (winner) {
        this.winnerId = winner.id;
        this.winnerReason = "3점 선취 즉시 승리";
        this.pushFeed(`${winner.name} 3점 달성! 즉시 승리`);
      }
    }
  }

  resolveTieWinner(candidates) {
    if (!candidates || candidates.length === 0) {
      return null;
    }
    const sorted = [...candidates].sort((a, b) => {
      if (b.lastHitScore !== a.lastHitScore) {
        return b.lastHitScore - a.lastHitScore;
      }
      if (b.smiteScore !== a.smiteScore) {
        return b.smiteScore - a.smiteScore;
      }
      if (a.scoreArrivalOrder !== b.scoreArrivalOrder) {
        return a.scoreArrivalOrder - b.scoreArrivalOrder;
      }
      return a.id.localeCompare(b.id);
    });
    return sorted[0] ?? null;
  }

  updatePlayers(dt) {
    this.players.forEach((player) => {
      player.character.onUpdate(player, dt, this);
      this.tickSkillCooldowns(player, dt);
      this.recomputePlayerStats(player);

      if (!player.alive) {
        return;
      }

      player.status.bind = Math.max(0, player.status.bind - dt);
      player.status.ink = Math.max(0, player.status.ink - dt);

      player.hp = Math.min(player.maxHp, player.hp + player.regen * dt);

      const canMove = player.status.bind <= 0;
      const moveVector = canMove ? player.inputMove : { x: 0, y: 0 };
      player.velocity.x = moveVector.x * player.computedMoveSpeed;
      player.velocity.y = moveVector.y * player.computedMoveSpeed;

      player.position.x = clamp(
        player.position.x + player.velocity.x * dt,
        GAME_CONFIG.arena.playerMinX,
        GAME_CONFIG.arena.playerMaxX
      );
      player.position.y = clamp(
        player.position.y + player.velocity.y * dt,
        GAME_CONFIG.arena.playerMinY,
        GAME_CONFIG.arena.playerMaxY
      );

      player.attackCooldown -= dt;
      const canAttack = player.status.bind <= 0;
      if (canAttack && player.attackIntent && player.attackCooldown <= 0 && this.boss.hp > 0) {
        this.fireNormalAttack(player);
        player.attackCooldown += player.computedAttackInterval;
      }
    });
  }

  fireNormalAttack(player) {
    let damage = player.computedAtk;
    const autoAim = normalizeVector(
      GAME_CONFIG.arena.bossX - player.position.x,
      GAME_CONFIG.arena.bossY - player.position.y
    );
    const aimDirection = player.manualAim ? player.aim : autoAim;
    const targetDot = aimDirection.x * autoAim.x + aimDirection.y * autoAim.y;
    if (targetDot < 0.15) {
      return;
    }

    if (player.status.ink > 0 && Math.random() < 0.2) {
      this.pushFeed(`${player.name} 먹물 효과로 공격 빗나감`);
      return;
    }

    damage = player.character.onAttack(
      player,
      {
        damage,
        target: "boss",
      },
      this
    );
    this.applyDamageToBoss(player, damage, "normal", this.commandCounter + 1);
    this.effects.push({
      kind: "shot",
      ttl: 0.12,
      from: { ...player.position },
      to: { x: GAME_CONFIG.arena.bossX, y: GAME_CONFIG.arena.bossY + 30 },
      color: player.color,
    });
  }

  updateBoss(dt) {
    if (this.boss.hp <= 0 || this.roundEnded) {
      return;
    }

    const frenzy = this.round >= GAME_CONFIG.frenzyTriggerRound && this.boss.hp <= this.boss.maxHp * 0.5;
    if (frenzy !== this.boss.frenzy) {
      this.boss.frenzy = frenzy;
      this.pushFeed(frenzy ? "크라켄 광란 발동!" : "크라켄 광란 해제");
    }

    const attackInterval = GAME_CONFIG.bossAttackIntervalSec / (this.boss.frenzy ? 1.25 : 1);
    const patternInterval = this.boss.frenzy ? 3.5 : 5;

    this.boss.attackTimer -= dt;
    if (this.boss.attackTimer <= 0) {
      const baseDamage = this.boss.baseDamage * (this.boss.frenzy ? 1.1 : 1);
      this.players.forEach((player) => {
        if (!player.alive) {
          return;
        }
        const finalDamage = calcReducedDamage(baseDamage, player.computedArmor);
        this.applyDamageToPlayer(player, finalDamage);
      });
      this.boss.attackTimer += attackInterval;
    }

    this.boss.patternTimer -= dt;
    if (this.boss.patternTimer <= 0) {
      this.castPattern();
      this.boss.patternTimer += patternInterval;
    }
  }

  applyDamageToPlayer(player, damage) {
    if (!player.alive) {
      return;
    }
    player.hp -= damage;
    if (player.hp <= 0) {
      player.hp = 0;
      player.alive = false;
      player.attackIntent = false;
      this.pushFeed(`${player.name} 라운드 탈락`);
    }
  }

  castPattern() {
    const pattern = weightedPick(PATTERN_TABLE);
    this.lastPatternMessage = `패턴: ${pattern}`;
    this.pushFeed(`크라켄 패턴 발동 - ${pattern}`);
    const baseDamage = this.boss.baseDamage * (this.boss.frenzy ? 1.1 : 1);

    const alivePlayers = this.players.filter((player) => player.alive);
    if (alivePlayers.length === 0) {
      return;
    }

    if (pattern === "Bind") {
      const target = alivePlayers[Math.floor(Math.random() * alivePlayers.length)];
      if (target.bindImmune) {
        this.pushFeed(`${target.name} Bind 면역 발동`);
      } else {
        target.status.bind = Math.max(target.status.bind, 1.8);
      }
      return;
    }

    if (pattern === "Swipe") {
      alivePlayers.forEach((player) => {
        const finalDamage = calcReducedDamage(baseDamage * 1.25, player.computedArmor);
        this.applyDamageToPlayer(player, finalDamage);
      });
      return;
    }

    if (pattern === "Projectile") {
      const target = alivePlayers[Math.floor(Math.random() * alivePlayers.length)];
      const finalDamage = calcReducedDamage(baseDamage * 1.5, target.computedArmor);
      this.applyDamageToPlayer(target, finalDamage);
      return;
    }

    if (pattern === "AoE") {
      alivePlayers.forEach((player) => {
        const finalDamage = calcReducedDamage(baseDamage * 1.05, player.computedArmor);
        this.applyDamageToPlayer(player, finalDamage);
      });
      return;
    }

    if (pattern === "Ink") {
      alivePlayers.forEach((player) => {
        player.status.ink = Math.max(player.status.ink, 2.4);
        const finalDamage = calcReducedDamage(baseDamage * 0.65, player.computedArmor);
        this.applyDamageToPlayer(player, finalDamage);
      });
    }
  }

  settleRoundGold() {
    const totalDamage = Object.values(this.roundDamage).reduce((sum, value) => sum + value, 0);
    const damagePool = 1800 + this.round * 250;
    this.players.forEach((player) => {
      const share = totalDamage > 0 ? Math.floor((damagePool * (this.roundDamage[player.id] ?? 0)) / totalDamage) : 0;
      player.gold = clamp(player.gold + share, 0, GAME_CONFIG.maxGold);
    });

    if (this.roundKillInfo?.killerId) {
      const killer = this.getPlayer(this.roundKillInfo.killerId);
      if (killer) {
        killer.gold = clamp(killer.gold + 1000, 0, GAME_CONFIG.maxGold);
        this.pushFeed(`${killer.name} 처치 기본 보상 +1000G`);
      }
    }
  }

  endBattleRound(reason) {
    if (this.roundEnded) {
      return;
    }
    this.roundEnded = true;
    this.settleRoundGold();

    if (this.winnerId) {
      this.phase = "gameOver";
      this.phaseRemaining = 0;
      return;
    }

    if (this.round >= GAME_CONFIG.maxRounds) {
      const sorted = [...this.players].sort((a, b) => {
        if (b.score !== a.score) {
          return b.score - a.score;
        }
        if (b.lastHitScore !== a.lastHitScore) {
          return b.lastHitScore - a.lastHitScore;
        }
        if (b.smiteScore !== a.smiteScore) {
          return b.smiteScore - a.smiteScore;
        }
        return a.scoreArrivalOrder - b.scoreArrivalOrder;
      });
      this.winnerId = sorted[0].id;
      this.winnerReason = "8라운드 종료 점수 우위";
      this.phase = "gameOver";
      this.phaseRemaining = 0;
      this.pushFeed(`${sorted[0].name} 최종 승리`);
      return;
    }

    this.startShopPhase();
    if (reason === "timeout") {
      this.pushFeed("시간 종료, 다음 라운드로 이동");
    }
  }

  updateBotsBattle(dt) {
    this.players.forEach((player) => {
      if (!player.isBot || !player.alive || this.phase !== "battle") {
        return;
      }

      player.botState.moveTimer -= dt;
      if (player.botState.moveTimer <= 0) {
        player.botState.moveTimer = 0.8 + Math.random() * 0.9;
        player.botState.targetX = 520 + Math.random() * 880;
        player.botState.targetY = 700 + Math.random() * 220;
      }

      const toTarget = normalizeVector(
        player.botState.targetX - player.position.x,
        player.botState.targetY - player.position.y
      );
      player.inputMove = toTarget;
      player.attackIntent = true;
      player.manualAim = false;
      player.aim = normalizeVector(
        GAME_CONFIG.arena.bossX - player.position.x,
        GAME_CONFIG.arena.bossY - player.position.y
      );

      if (!player.smiteUsed && this.boss.hp <= this.boss.smiteDamage + 190) {
        this.queueCommand({
          type: "smite",
          playerId: player.id,
          networkLagMs: 15 + Math.random() * 65,
        });
      }

      player.botState.skillThinkTimer -= dt;
      if (player.botState.skillThinkTimer <= 0) {
        player.botState.skillThinkTimer = 0.8 + Math.random() * 1.2;
        const hpRate = player.hp / player.maxHp;
        const bossHpRate = this.boss.hp / this.boss.maxHp;

        let slot = null;
        if (hpRate < 0.55 && player.skillCooldowns.w <= 0) {
          slot = "w";
        } else if (bossHpRate < 0.45 && player.skillCooldowns.e <= 0) {
          slot = "e";
        } else if (player.skillCooldowns.q <= 0) {
          slot = "q";
        }

        if (slot) {
          this.queueCommand({
            type: "skill",
            slot,
            playerId: player.id,
            networkLagMs: 8 + Math.random() * 30,
          });
        }
      }
    });
  }

  updateEffects(dt) {
    this.effects.forEach((effect) => {
      effect.ttl -= dt;
    });
    this.effects = this.effects.filter((effect) => effect.ttl > 0);
  }

  update(dt) {
    if (this.phase === "gameOver") {
      this.updateEffects(dt);
      return;
    }

    this.serverTime += dt;
    this.processCommands();

    if (this.phase === "battle") {
      this.updateBotsBattle(dt);
      this.updatePlayers(dt);
      this.updateBoss(dt);

      const allDead = this.players.every((player) => !player.alive);
      this.phaseRemaining -= dt;
      if (allDead) {
        this.endBattleRound("allDead");
      } else if (this.phaseRemaining <= 0 && !this.roundEnded) {
        this.phaseRemaining = 0;
        this.endBattleRound("timeout");
      }
    } else if (this.phase === "shop") {
      this.players.forEach((player) => this.runBotShop(player));
      this.phaseRemaining -= dt;
      if (this.phaseRemaining <= 0) {
        this.phaseRemaining = 0;
        this.startRound(this.round + 1);
      }
    }

    this.updateEffects(dt);
  }

  getState() {
    return {
      serverTime: this.serverTime,
      round: this.round,
      phase: this.phase,
      phaseRemaining: this.phaseRemaining,
      localPlayerId: this.localPlayerId,
      winnerId: this.winnerId,
      winnerReason: this.winnerReason,
      boss: {
        hp: this.boss.hp,
        maxHp: this.boss.maxHp,
        smiteDamage: this.boss.smiteDamage,
        frenzy: this.boss.frenzy,
      },
      players: this.players.map((player) => ({
        id: player.id,
        name: player.name,
        color: player.color,
        alive: player.alive,
        hp: player.hp,
        maxHp: player.maxHp,
        score: player.score,
        smiteScore: player.smiteScore,
        lastHitScore: player.lastHitScore,
        gold: player.gold,
        smiteUsed: player.smiteUsed,
        characterId: player.characterId,
        characterName: player.character.name,
        position: { ...player.position },
        status: { ...player.status },
        stats: {
          atk: round2(player.computedAtk),
          magic: round2(player.computedMagic),
          armor: round2(player.computedArmor),
          attackSpeed: round2(player.computedAttackSpeed),
          attackInterval: round2(player.computedAttackInterval),
          moveSpeed: round2(player.computedMoveSpeed),
        },
        inventory: {
          normal: [...player.inventory.normal],
          boots: player.inventory.boots,
          ultimate: player.inventory.ultimate,
        },
        skills: {
          q: {
            name: player.skillBook.q.name,
            cooldown: player.skillBook.q.cooldown,
            remaining: round2(player.skillCooldowns.q),
            description: player.skillBook.q.description,
          },
          w: {
            name: player.skillBook.w.name,
            cooldown: player.skillBook.w.cooldown,
            remaining: round2(player.skillCooldowns.w),
            description: player.skillBook.w.description,
          },
          e: {
            name: player.skillBook.e.name,
            cooldown: player.skillBook.e.cooldown,
            remaining: round2(player.skillCooldowns.e),
            description: player.skillBook.e.description,
          },
        },
      })),
      roundDamage: { ...this.roundDamage },
      patternMessage: this.lastPatternMessage,
      feed: [...this.feed],
      effects: this.effects.map((effect) => ({
        ...effect,
        from: effect.from ? { ...effect.from } : undefined,
        to: effect.to ? { ...effect.to } : undefined,
      })),
      config: {
        maxRounds: GAME_CONFIG.maxRounds,
        scoreToWin: GAME_CONFIG.scoreToWin,
      },
    };
  }
}
