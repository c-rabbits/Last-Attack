import { GAME_CONFIG } from "./constants.js";

export class CharacterBase {
  constructor(id, name) {
    this.id = id;
    this.name = name;
  }

  onRoundStart(_player, _server) {}

  onUpdate(_player, _dt, _server) {}

  onScoreChanged(_player, _reason, _server) {}

  getBonusStats(_player, _server) {
    return {
      atkFlat: 0,
      armorFlat: 0,
      magicFlat: 0,
      atkSpeedBonus: 0,
      moveSpeedFlat: 0,
      bindImmune: false,
    };
  }

  onAttack(_player, context, _server) {
    return context.damage;
  }

  getSkillDefinitions(_player, _server) {
    return {
      q: { name: "Q 스킬", cooldown: 10, icon: "STRIKE", description: "기본 Q 스킬" },
      w: { name: "W 스킬", cooldown: 14, icon: "BOOST", description: "기본 W 스킬" },
      e: { name: "E 스킬", cooldown: 20, icon: "FINISH", description: "기본 E 스킬" },
    };
  }

  castSkill(_slot, _player, _server) {
    return false;
  }
}

class StateShiftCharacter extends CharacterBase {
  constructor() {
    super("state", "상태 전환형");
  }

  onRoundStart(player) {
    const state = player.characterState;
    state.mode = state.mode ?? "assault";
    state.modeTimer = 5;
    state.lockMode = null;
    state.lockTimer = 0;
  }

  onUpdate(player, dt, server) {
    const state = player.characterState;
    if (state.lockTimer > 0) {
      state.lockTimer -= dt;
      if (state.lockTimer <= 0) {
        state.lockMode = null;
        state.lockTimer = 0;
        state.modeTimer = 4.2;
      }
      return;
    }

    state.modeTimer -= dt;
    if (state.modeTimer <= 0) {
      state.mode = state.mode === "assault" ? "guard" : "assault";
      state.modeTimer = 5;
      server.pushFeed(`${player.name} 태세 전환: ${state.mode === "assault" ? "공격" : "수비"}`);
    }
  }

  getBonusStats(player) {
    const state = player.characterState;
    const mode = state.lockMode ?? state.mode;

    const bonus = {
      atkFlat: 0,
      armorFlat: 0,
      magicFlat: 0,
      atkSpeedBonus: 0,
      moveSpeedFlat: 0,
      bindImmune: false,
    };

    if (mode === "assault") {
      bonus.atkFlat += 20;
    } else {
      bonus.armorFlat += 16;
    }

    if (state.lockMode === "assault") {
      bonus.atkFlat += 24;
      bonus.atkSpeedBonus += 0.22;
    }
    if (state.lockMode === "guard") {
      bonus.armorFlat += 24;
      bonus.moveSpeedFlat += 30;
    }

    return bonus;
  }

  getSkillDefinitions() {
    return {
      q: { name: "돌격 개시", cooldown: 12, icon: "RUSH", description: "공격 태세 고정, 공속 증가" },
      w: { name: "철벽 진형", cooldown: 14, icon: "GUARD", description: "수비 태세 고정, 즉시 회복" },
      e: { name: "태세 파쇄", cooldown: 20, icon: "BREAK", description: "현재 태세 기반 강타 스킬" },
    };
  }

  castSkill(slot, player, server) {
    const state = player.characterState;
    if (slot === "q") {
      state.mode = "assault";
      state.lockMode = "assault";
      state.lockTimer = 4;
      state.modeTimer = 5;
      server.pushFeed(`${player.name} Q: 돌격 개시`);
      server.spawnSkillEffect(player, "#ffb35e");
      return true;
    }

    if (slot === "w") {
      state.mode = "guard";
      state.lockMode = "guard";
      state.lockTimer = 4;
      state.modeTimer = 5;
      const healed = server.healPlayer(player, player.maxHp * 0.12 + player.computedArmor * 1.6);
      server.pushFeed(`${player.name} W: 철벽 진형 (${Math.floor(healed)} 회복)`);
      server.spawnSkillEffect(player, "#8db3ff");
      return true;
    }

    if (slot === "e") {
      const mode = state.lockMode ?? state.mode;
      const damage =
        mode === "assault"
          ? player.computedAtk * 2.2 + player.computedMagic * 0.8
          : player.computedAtk * 1.4 + player.computedArmor * 6.2;
      server.dealSkillDamage(player, damage, "태세 파쇄");
      server.pushFeed(`${player.name} E: 태세 파쇄`);
      return true;
    }

    return false;
  }
}

class MagicWandCharacter extends CharacterBase {
  constructor() {
    super("wand", "마법봉");
  }

  onRoundStart(player) {
    const state = player.characterState;
    if (typeof state.wandStacks !== "number") {
      state.wandStacks = 0;
    }
    state.wandHasteTimer = 0;
  }

  onUpdate(player, dt) {
    const state = player.characterState;
    state.wandHasteTimer = Math.max(0, (state.wandHasteTimer ?? 0) - dt);
  }

  onAttack(player, context, server) {
    const state = player.characterState;
    state.wandStacks = Math.min(25, (state.wandStacks ?? 0) + 1);
    if (state.wandStacks > 0 && state.wandStacks % 5 === 0) {
      server.pushFeed(`${player.name} 마법봉 스택 ${state.wandStacks}`);
    }

    return context.damage + state.wandStacks * 2.2 + player.computedMagic * 0.08;
  }

  getBonusStats(player) {
    const stacks = player.characterState.wandStacks ?? 0;
    const hasteTimer = player.characterState.wandHasteTimer ?? 0;
    return {
      atkFlat: 0,
      armorFlat: 0,
      magicFlat: stacks * 1.6,
      atkSpeedBonus: hasteTimer > 0 ? 0.15 : 0,
      moveSpeedFlat: 0,
      bindImmune: false,
    };
  }

  getSkillDefinitions() {
    return {
      q: { name: "비전 탄막", cooldown: 10, icon: "ARC", description: "다중 탄막으로 강한 누적 피해" },
      w: { name: "마력 응축", cooldown: 16, icon: "MANA", description: "스택 획득, 공속 강화, 회복" },
      e: { name: "오버차지 폭발", cooldown: 22, icon: "BLAST", description: "스택 소모 폭발 피해" },
    };
  }

  castSkill(slot, player, server) {
    const state = player.characterState;
    if (slot === "q") {
      const stacks = state.wandStacks ?? 0;
      const perHit = player.computedAtk * 0.35 + player.computedMagic * 0.52 + stacks * 1.4;
      const damage = perHit * 4;
      server.dealSkillDamage(player, damage, "비전 탄막");
      server.pushFeed(`${player.name} Q: 비전 탄막`);
      return true;
    }

    if (slot === "w") {
      state.wandStacks = Math.min(25, (state.wandStacks ?? 0) + 4);
      state.wandHasteTimer = 6;
      const healed = server.healPlayer(player, 220 + player.computedMagic * 0.35);
      server.pushFeed(`${player.name} W: 마력 응축 (${Math.floor(healed)} 회복)`);
      server.spawnSkillEffect(player, "#ab95ff");
      return true;
    }

    if (slot === "e") {
      const consumed = state.wandStacks ?? 0;
      state.wandStacks = 0;
      const damage = player.computedMagic * 1.1 + consumed * 48;
      server.dealSkillDamage(player, damage, "오버차지 폭발");
      server.pushFeed(`${player.name} E: 오버차지 폭발 (${consumed}스택 소모)`);
      return true;
    }

    return false;
  }
}

class BoomerangCharacter extends CharacterBase {
  constructor() {
    super("boomerang", "부메랑");
  }

  onRoundStart(player) {
    const state = player.characterState;
    if (typeof state.boomerangScale !== "number") {
      state.boomerangScale = 0;
    }
    state.huntTimer = 0;
  }

  onUpdate(player, dt) {
    const state = player.characterState;
    state.huntTimer = Math.max(0, (state.huntTimer ?? 0) - dt);
  }

  onScoreChanged(player, _reason, server) {
    player.characterState.boomerangScale += 1;
    server.pushFeed(`${player.name} 부메랑 성장 +1`);
  }

  getBonusStats(player) {
    const scale = player.characterState.boomerangScale ?? 0;
    const huntTimer = player.characterState.huntTimer ?? 0;
    return {
      atkFlat: scale * 16,
      armorFlat: 0,
      magicFlat: 0,
      atkSpeedBonus: scale * 0.05 + (huntTimer > 0 ? 0.22 : 0),
      moveSpeedFlat: huntTimer > 0 ? 90 : 0,
      bindImmune: false,
    };
  }

  getSkillDefinitions() {
    return {
      q: { name: "리턴 부메랑", cooldown: 11, icon: "RETURN", description: "왕복 2타를 즉시 판정" },
      w: { name: "수렵 본능", cooldown: 15, icon: "HUNT", description: "이속/공속 강화 및 소량 회복" },
      e: { name: "승점 각성", cooldown: 24, icon: "SCORE", description: "점수 비례 마무리 스킬" },
    };
  }

  castSkill(slot, player, server) {
    const state = player.characterState;
    const scale = state.boomerangScale ?? 0;
    if (slot === "q") {
      const damage = (player.computedAtk * 0.95 + scale * 13) * 2;
      server.dealSkillDamage(player, damage, "리턴 부메랑");
      server.pushFeed(`${player.name} Q: 리턴 부메랑`);
      return true;
    }

    if (slot === "w") {
      state.huntTimer = 6;
      const healed = server.healPlayer(player, 150 + scale * 12);
      server.pushFeed(`${player.name} W: 수렵 본능 (${Math.floor(healed)} 회복)`);
      server.spawnSkillEffect(player, "#ffb96e");
      return true;
    }

    if (slot === "e") {
      const damage = player.computedAtk * 1.3 + player.score * 160 + scale * 95;
      server.dealSkillDamage(player, damage, "승점 각성");
      server.pushFeed(`${player.name} E: 승점 각성`);
      return true;
    }

    return false;
  }
}

class BowCharacter extends CharacterBase {
  constructor() {
    super("bow", "활");
  }

  onRoundStart(player) {
    const state = player.characterState;
    state.focusShots = 0;
  }

  onAttack(player, context) {
    const attackSpeedGain = Math.max(0, player.computedAttackSpeed - GAME_CONFIG.baseAttackSpeed);
    let damage = context.damage + attackSpeedGain * 52;
    const state = player.characterState;
    if ((state.focusShots ?? 0) > 0) {
      state.focusShots -= 1;
      damage += player.computedMagic * 0.35 + 40;
    }
    return damage;
  }

  getSkillDefinitions() {
    return {
      q: { name: "관통 화살", cooldown: 9, icon: "PIERCE", description: "공속 비례 단일 강타" },
      w: { name: "집중 사격", cooldown: 14, icon: "FOCUS", description: "다음 평타 5회 강화" },
      e: { name: "폭우 사격", cooldown: 20, icon: "BARRAGE", description: "다단 히트 난사" },
    };
  }

  castSkill(slot, player, server) {
    const state = player.characterState;
    if (slot === "q") {
      const damage = player.computedAtk + player.computedAttackSpeed * 115;
      server.dealSkillDamage(player, damage, "관통 화살");
      server.pushFeed(`${player.name} Q: 관통 화살`);
      return true;
    }

    if (slot === "w") {
      state.focusShots = Math.min(8, (state.focusShots ?? 0) + 5);
      server.pushFeed(`${player.name} W: 집중 사격`);
      server.spawnSkillEffect(player, "#9fd8ff");
      return true;
    }

    if (slot === "e") {
      const perHit = player.computedAtk * 0.45 + player.computedAttackSpeed * 28;
      server.dealSkillDamage(player, perHit * 6, "폭우 사격");
      server.pushFeed(`${player.name} E: 폭우 사격`);
      return true;
    }

    return false;
  }
}

class CrossbowCharacter extends CharacterBase {
  constructor() {
    super("crossbow", "석궁");
  }

  onRoundStart(player) {
    const state = player.characterState;
    state.crossbowBeat = 0;
    state.momentum = 0;
    state.stationarySec = 0;
    state.reloadRushTimer = 0;
    state.bastionTimer = 0;
  }

  onUpdate(player, dt) {
    const state = player.characterState;
    const speed = Math.hypot(player.velocity.x, player.velocity.y);
    if (speed > 120) {
      state.momentum = Math.min(1, state.momentum + dt * 0.9);
      state.stationarySec = 0;
    } else {
      state.momentum = Math.max(0, state.momentum - dt * 0.55);
      state.stationarySec += dt;
    }
    state.reloadRushTimer = Math.max(0, (state.reloadRushTimer ?? 0) - dt);
    state.bastionTimer = Math.max(0, (state.bastionTimer ?? 0) - dt);
  }

  getBonusStats(player) {
    const state = player.characterState;
    return {
      atkFlat: 0,
      armorFlat: state.bastionTimer > 0 ? 20 : 0,
      magicFlat: 0,
      atkSpeedBonus: state.reloadRushTimer > 0 ? 0.1 : 0,
      moveSpeedFlat: state.reloadRushTimer > 0 ? 120 : 0,
      bindImmune: false,
    };
  }

  onAttack(player, context) {
    const state = player.characterState;
    state.crossbowBeat = (state.crossbowBeat + 1) % 3;

    let damage = context.damage + state.momentum * 24;
    if (state.stationarySec > 1.2) {
      damage += 18;
    }
    if (state.crossbowBeat === 0) {
      damage *= 1.35;
    }

    return damage;
  }

  getSkillDefinitions() {
    return {
      q: { name: "리듬 브레이크", cooldown: 8, icon: "RHYTHM", description: "리듬 성공 시 큰 피해" },
      w: { name: "기동 재장전", cooldown: 13, icon: "DASH", description: "재장전 초기화 + 기동 강화" },
      e: { name: "전환 포격", cooldown: 21, icon: "SIEGE", description: "이동 에너지 소모 포격" },
    };
  }

  castSkill(slot, player, server) {
    const state = player.characterState;
    if (slot === "q") {
      const perfect = state.crossbowBeat === 2;
      const damage =
        player.computedAtk * (perfect ? 2.2 : 1.2) + state.momentum * (perfect ? 140 : 90);
      state.crossbowBeat = 0;
      server.dealSkillDamage(player, damage, "리듬 브레이크");
      server.pushFeed(`${player.name} Q: 리듬 브레이크${perfect ? " (퍼펙트)" : ""}`);
      return true;
    }

    if (slot === "w") {
      state.reloadRushTimer = 3;
      state.momentum = Math.min(1, state.momentum + 0.5);
      player.attackCooldown = 0;
      server.movePlayerBy(player, 0, -120);
      server.pushFeed(`${player.name} W: 기동 재장전`);
      server.spawnSkillEffect(player, "#9bf8f1");
      return true;
    }

    if (slot === "e") {
      const momentum = state.momentum ?? 0;
      const damage = player.computedAtk * 1.2 + momentum * 220 + player.computedMoveSpeed * 0.25;
      state.momentum *= 0.4;
      state.bastionTimer = 4;
      server.dealSkillDamage(player, damage, "전환 포격");
      server.pushFeed(`${player.name} E: 전환 포격`);
      return true;
    }

    return false;
  }
}

export function createCharacter(id) {
  switch (id) {
    case "state":
      return new StateShiftCharacter();
    case "wand":
      return new MagicWandCharacter();
    case "boomerang":
      return new BoomerangCharacter();
    case "bow":
      return new BowCharacter();
    case "crossbow":
      return new CrossbowCharacter();
    default:
      return new StateShiftCharacter();
  }
}
