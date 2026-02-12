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
}

class StateShiftCharacter extends CharacterBase {
  constructor() {
    super("state", "상태 전환형");
  }

  onRoundStart(player) {
    const state = player.characterState;
    if (!state.mode) {
      state.mode = "assault";
      state.modeTimer = 5;
    }
  }

  onUpdate(player, dt, server) {
    const state = player.characterState;
    state.modeTimer -= dt;
    if (state.modeTimer <= 0) {
      state.mode = state.mode === "assault" ? "guard" : "assault";
      state.modeTimer = 5;
      server.pushFeed(`${player.name} 태세 전환: ${state.mode === "assault" ? "공격" : "수비"}`);
    }
  }

  getBonusStats(player) {
    const state = player.characterState;
    if (state.mode === "assault") {
      return {
        atkFlat: 20,
        armorFlat: 0,
        magicFlat: 0,
        atkSpeedBonus: 0,
        moveSpeedFlat: 0,
        bindImmune: false,
      };
    }

    return {
      atkFlat: 0,
      armorFlat: 16,
      magicFlat: 0,
      atkSpeedBonus: 0,
      moveSpeedFlat: 0,
      bindImmune: false,
    };
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
  }

  onAttack(player, context, server) {
    const state = player.characterState;
    state.wandStacks = Math.min(20, (state.wandStacks ?? 0) + 1);
    if (state.wandStacks > 0 && state.wandStacks % 5 === 0) {
      server.pushFeed(`${player.name} 마법봉 스택 ${state.wandStacks}`);
    }

    return context.damage + state.wandStacks * 2.2 + player.magic * 0.08;
  }

  getBonusStats(player) {
    const stacks = player.characterState.wandStacks ?? 0;
    return {
      atkFlat: 0,
      armorFlat: 0,
      magicFlat: stacks * 1.6,
      atkSpeedBonus: 0,
      moveSpeedFlat: 0,
      bindImmune: false,
    };
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
  }

  onScoreChanged(player, _reason, server) {
    player.characterState.boomerangScale += 1;
    server.pushFeed(`${player.name} 부메랑 성장 +1`);
  }

  getBonusStats(player) {
    const scale = player.characterState.boomerangScale ?? 0;
    return {
      atkFlat: scale * 16,
      armorFlat: 0,
      magicFlat: 0,
      atkSpeedBonus: scale * 0.05,
      moveSpeedFlat: 0,
      bindImmune: false,
    };
  }
}

class BowCharacter extends CharacterBase {
  constructor() {
    super("bow", "활");
  }

  onAttack(player, context) {
    const attackSpeedGain = Math.max(0, player.computedAttackSpeed - GAME_CONFIG.baseAttackSpeed);
    return context.damage + attackSpeedGain * 52;
  }
}

class CrossbowCharacter extends CharacterBase {
  constructor() {
    super("crossbow", "석궁");
  }

  onRoundStart(player) {
    const state = player.characterState;
    state.crossbowBeat = state.crossbowBeat ?? 0;
    state.momentum = state.momentum ?? 0;
    state.stationarySec = state.stationarySec ?? 0;
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
