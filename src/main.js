import { CHARACTER_POOL, GAME_CONFIG, ITEM_CATALOG } from "./constants.js";
import { GameServer } from "./game.js";

const canvas = document.getElementById("game-canvas");
const ctx = canvas.getContext("2d");

const roundLabel = document.getElementById("round-label");
const phaseLabel = document.getElementById("phase-label");
const timerLabel = document.getElementById("timer-label");
const bossLabel = document.getElementById("boss-label");
const patternLabel = document.getElementById("pattern-label");
const playerBoard = document.getElementById("player-board");
const feedBox = document.getElementById("feed");
const overlayMessage = document.getElementById("overlay-message");
const shopPanel = document.getElementById("shop-panel");
const shopItems = document.getElementById("shop-items");

const leftStickEl = document.getElementById("left-stick");
const rightStickEl = document.getElementById("right-stick");
const leftThumb = document.getElementById("left-thumb");
const rightThumb = document.getElementById("right-thumb");
const attackBtn = document.getElementById("attack-btn");
const smiteBtn = document.getElementById("smite-btn");
const characterSelect = document.getElementById("character-select");

const world = {
  width: GAME_CONFIG.arena.width,
  height: GAME_CONFIG.arena.height,
};

const server = new GameServer();

const inputState = {
  move: { x: 0, y: 0 },
  aim: { x: 0, y: -1 },
  manualAim: false,
  attackPressed: false,
};

const keyboard = {
  up: false,
  down: false,
  left: false,
  right: false,
  attack: false,
};

const transmitCache = {
  move: { x: 0, y: 0 },
  aim: { x: 0, y: -1 },
  manualAim: false,
  attackPressed: false,
  timer: 0,
};

function normalize(x, y) {
  const len = Math.hypot(x, y);
  if (len <= 0.0001) {
    return { x: 0, y: 0 };
  }
  return { x: x / len, y: y / len };
}

function vectorDiff(a, b) {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

function resizeCanvas() {
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.floor(window.innerWidth * dpr);
  canvas.height = Math.floor(window.innerHeight * dpr);
  canvas.style.width = `${window.innerWidth}px`;
  canvas.style.height = `${window.innerHeight}px`;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
}

function getProjection() {
  const scale = Math.min(canvas.width / world.width, canvas.height / world.height);
  const offsetX = (canvas.width - world.width * scale) / 2;
  const offsetY = (canvas.height - world.height * scale) / 2;
  return { scale, offsetX, offsetY };
}

function project(x, y, projection) {
  return {
    x: projection.offsetX + x * projection.scale,
    y: projection.offsetY + y * projection.scale,
  };
}

function createVirtualStick(root, thumb, onChange) {
  const state = {
    active: false,
    pointerId: null,
    x: 0,
    y: 0,
  };
  const radius = 54;

  function updateFromEvent(event) {
    const rect = root.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    let dx = event.clientX - cx;
    let dy = event.clientY - cy;
    const length = Math.hypot(dx, dy);
    if (length > radius) {
      dx = (dx / length) * radius;
      dy = (dy / length) * radius;
    }
    state.x = dx / radius;
    state.y = dy / radius;
    thumb.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
    onChange(state.x, state.y, true);
  }

  function reset() {
    state.active = false;
    state.pointerId = null;
    state.x = 0;
    state.y = 0;
    thumb.style.transform = "translate(-50%, -50%)";
    onChange(0, 0, false);
  }

  root.addEventListener("pointerdown", (event) => {
    state.active = true;
    state.pointerId = event.pointerId;
    root.setPointerCapture(event.pointerId);
    updateFromEvent(event);
  });
  root.addEventListener("pointermove", (event) => {
    if (!state.active || event.pointerId !== state.pointerId) {
      return;
    }
    updateFromEvent(event);
  });
  root.addEventListener("pointerup", (event) => {
    if (event.pointerId !== state.pointerId) {
      return;
    }
    reset();
  });
  root.addEventListener("pointercancel", (event) => {
    if (event.pointerId !== state.pointerId) {
      return;
    }
    reset();
  });
  return state;
}

const leftStickState = createVirtualStick(leftStickEl, leftThumb, (x, y) => {
  inputState.move = normalize(x, y);
});
createVirtualStick(rightStickEl, rightThumb, (x, y, active) => {
  const aim = normalize(x, y);
  inputState.manualAim = active && Math.hypot(x, y) > 0.2;
  if (inputState.manualAim) {
    inputState.aim = aim;
  } else {
    inputState.aim = { x: 0, y: -1 };
  }
});

attackBtn.addEventListener("pointerdown", () => {
  inputState.attackPressed = true;
  attackBtn.classList.add("pressed");
});
const releaseAttack = () => {
  inputState.attackPressed = false;
  attackBtn.classList.remove("pressed");
};
attackBtn.addEventListener("pointerup", releaseAttack);
attackBtn.addEventListener("pointercancel", releaseAttack);
attackBtn.addEventListener("pointerleave", releaseAttack);

smiteBtn.addEventListener("click", () => {
  server.queueCommand({
    type: "smite",
    playerId: server.localPlayerId,
  });
});

window.addEventListener("keydown", (event) => {
  if (event.code === "KeyW" || event.code === "ArrowUp") {
    keyboard.up = true;
  } else if (event.code === "KeyS" || event.code === "ArrowDown") {
    keyboard.down = true;
  } else if (event.code === "KeyA" || event.code === "ArrowLeft") {
    keyboard.left = true;
  } else if (event.code === "KeyD" || event.code === "ArrowRight") {
    keyboard.right = true;
  } else if (event.code === "Space" || event.code === "KeyJ") {
    keyboard.attack = true;
  } else if (event.code === "KeyF") {
    server.queueCommand({
      type: "smite",
      playerId: server.localPlayerId,
    });
  }
});

window.addEventListener("keyup", (event) => {
  if (event.code === "KeyW" || event.code === "ArrowUp") {
    keyboard.up = false;
  } else if (event.code === "KeyS" || event.code === "ArrowDown") {
    keyboard.down = false;
  } else if (event.code === "KeyA" || event.code === "ArrowLeft") {
    keyboard.left = false;
  } else if (event.code === "KeyD" || event.code === "ArrowRight") {
    keyboard.right = false;
  } else if (event.code === "Space" || event.code === "KeyJ") {
    keyboard.attack = false;
  }
});

function applyKeyboardMovement() {
  let x = 0;
  let y = 0;
  if (keyboard.left) {
    x -= 1;
  }
  if (keyboard.right) {
    x += 1;
  }
  if (keyboard.up) {
    y -= 1;
  }
  if (keyboard.down) {
    y += 1;
  }
  const keyboardMove = normalize(x, y);
  if (Math.hypot(keyboardMove.x, keyboardMove.y) > 0) {
    inputState.move = keyboardMove;
  } else if (!leftStickState.active) {
    inputState.move = { x: 0, y: 0 };
  }

  if (keyboard.attack) {
    inputState.attackPressed = true;
  } else if (!attackBtn.classList.contains("pressed")) {
    inputState.attackPressed = false;
  }
}

function maybeSendCommands(dt) {
  transmitCache.timer -= dt;
  if (transmitCache.timer > 0) {
    return;
  }
  transmitCache.timer = 0.05;

  if (vectorDiff(transmitCache.move, inputState.move) > 0.02) {
    transmitCache.move = { ...inputState.move };
    server.queueCommand({
      type: "move",
      playerId: server.localPlayerId,
      x: inputState.move.x,
      y: inputState.move.y,
    });
  }

  if (inputState.manualAim || transmitCache.manualAim) {
    if (
      vectorDiff(transmitCache.aim, inputState.aim) > 0.02 ||
      transmitCache.manualAim !== inputState.manualAim
    ) {
      transmitCache.aim = { ...inputState.aim };
      transmitCache.manualAim = inputState.manualAim;
      server.queueCommand({
        type: "aim",
        playerId: server.localPlayerId,
        x: inputState.aim.x,
        y: inputState.aim.y,
        manual: inputState.manualAim,
      });
    }
  }

  if (transmitCache.attackPressed !== inputState.attackPressed) {
    transmitCache.attackPressed = inputState.attackPressed;
    server.queueCommand({
      type: "attack",
      playerId: server.localPlayerId,
      pressed: inputState.attackPressed,
    });
  }
}

function buildCharacterOptions() {
  CHARACTER_POOL.forEach((character) => {
    const option = document.createElement("option");
    option.value = character.id;
    option.textContent = character.name;
    characterSelect.append(option);
  });
  characterSelect.addEventListener("change", () => {
    server.queueCommand({
      type: "character",
      playerId: server.localPlayerId,
      characterId: characterSelect.value,
    });
  });
}

function buildShopButtons() {
  ITEM_CATALOG.forEach((item) => {
    const button = document.createElement("button");
    button.className = "shop-item";
    button.dataset.itemId = item.id;
    button.innerHTML = `<strong>${item.name}</strong><small>${item.cost}G · ${item.slot}</small><small>${item.description}</small>`;
    button.addEventListener("click", () => {
      server.queueCommand({
        type: "buy",
        playerId: server.localPlayerId,
        itemId: item.id,
      });
    });
    shopItems.append(button);
  });
}

function canBuyItem(localPlayer, item, phase) {
  if (!localPlayer || phase !== "shop") {
    return false;
  }
  if (localPlayer.gold < item.cost) {
    return false;
  }
  if (item.slot === "normal" && localPlayer.inventory.normal.length >= 4) {
    return false;
  }
  if (item.slot === "boots" && localPlayer.inventory.boots) {
    return false;
  }
  if (item.slot === "ultimate" && localPlayer.inventory.ultimate) {
    return false;
  }
  return true;
}

function updateShopUI(state, localPlayer) {
  if (state.phase === "shop") {
    shopPanel.classList.remove("hidden");
  } else {
    shopPanel.classList.add("hidden");
  }

  const buttons = shopItems.querySelectorAll(".shop-item");
  buttons.forEach((button) => {
    const item = ITEM_CATALOG.find((entry) => entry.id === button.dataset.itemId);
    if (!item) {
      return;
    }
    button.disabled = !canBuyItem(localPlayer, item, state.phase);
  });
}

function updateHUD(state) {
  const localPlayer = state.players.find((player) => player.id === state.localPlayerId);
  const winner = state.players.find((player) => player.id === state.winnerId);

  roundLabel.textContent = `R${state.round} / ${state.config.maxRounds}`;
  const phaseText =
    state.phase === "battle" ? "전투" : state.phase === "shop" ? "상점" : "게임 종료";
  phaseLabel.textContent = phaseText;
  timerLabel.textContent = `${Math.max(0, state.phaseRemaining).toFixed(1)}s`;
  bossLabel.textContent = `보스 ${Math.ceil(state.boss.hp)} / ${state.boss.maxHp} · 강타 ${state.boss.smiteDamage}`;
  patternLabel.textContent = state.patternMessage + (state.boss.frenzy ? " (광란)" : "");

  playerBoard.innerHTML = state.players
    .map((player) => {
      const hpPercent = Math.max(0, Math.min(100, (player.hp / player.maxHp) * 100));
      return `<div class="player-card ${player.id === state.localPlayerId ? "me" : ""}">
        <div class="player-name">
          <span style="color:${player.color}">${player.name}</span>
          <span>${player.alive ? "생존" : "관전"}</span>
        </div>
        <div class="hp-track"><div class="hp-fill" style="width:${hpPercent}%;background:${player.color}"></div></div>
        <div>점수 ${player.score} (막타 ${player.lastHitScore} / 강타 ${player.smiteScore})</div>
        <div>골드 ${Math.floor(player.gold)} · 캐릭터 ${player.characterName}</div>
      </div>`;
    })
    .join("");

  feedBox.innerHTML = state.feed
    .map(
      (feed) => `<div class="feed-item">[${feed.t.toFixed(1)}] ${feed.message}</div>`
    )
    .join("");

  if (localPlayer?.smiteUsed && state.phase === "battle") {
    smiteBtn.classList.add("used");
  } else {
    smiteBtn.classList.remove("used");
  }

  if (localPlayer && characterSelect.value !== localPlayer.characterId) {
    characterSelect.value = localPlayer.characterId;
  }
  characterSelect.disabled = !(state.phase === "shop" || (state.round === 1 && state.serverTime < 4));

  updateShopUI(state, localPlayer);

  if (state.phase === "gameOver" && winner) {
    overlayMessage.classList.add("visible");
    overlayMessage.textContent = `${winner.name} 승리 · ${state.winnerReason}`;
  } else if (state.phase === "shop") {
    overlayMessage.classList.add("visible");
    overlayMessage.textContent = `라운드 ${state.round} 종료 · 상점 준비`;
  } else {
    overlayMessage.classList.remove("visible");
  }
}

function drawBackground(projection, nowSec) {
  const top = project(0, 0, projection);
  const bottom = project(world.width, world.height, projection);
  const grad = ctx.createLinearGradient(0, top.y, 0, bottom.y);
  grad.addColorStop(0, "#1d4e78");
  grad.addColorStop(0.62, "#0c2640");
  grad.addColorStop(1, "#071320");
  ctx.fillStyle = grad;
  ctx.fillRect(top.x, top.y, bottom.x - top.x, bottom.y - top.y);

  ctx.fillStyle = "rgba(120, 181, 255, 0.12)";
  for (let i = 0; i < 6; i += 1) {
    const y = 190 + i * 120 + Math.sin(nowSec * 0.8 + i) * 16;
    const p = project(960, y, projection);
    ctx.beginPath();
    ctx.ellipse(p.x, p.y, projection.scale * (490 + i * 14), projection.scale * 34, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  const floorY = project(0, 930, projection).y;
  ctx.fillStyle = "rgba(7, 18, 33, 0.88)";
  ctx.fillRect(0, floorY, canvas.width, canvas.height - floorY);
}

function drawBoss(state, projection) {
  const bossPos = project(GAME_CONFIG.arena.bossX, GAME_CONFIG.arena.bossY, projection);
  const radius = GAME_CONFIG.arena.bossRadius * projection.scale;

  for (let i = 0; i < 8; i += 1) {
    const angle = (Math.PI * (0.25 + i * 0.2)) % (Math.PI * 2);
    const x = bossPos.x + Math.cos(angle) * radius * 0.7;
    const y = bossPos.y + Math.sin(angle) * radius * 0.45 + radius * 0.85;
    ctx.strokeStyle = state.boss.frenzy ? "rgba(255, 119, 150, 0.55)" : "rgba(97, 181, 255, 0.5)";
    ctx.lineWidth = Math.max(2, projection.scale * 8);
    ctx.beginPath();
    ctx.moveTo(bossPos.x + Math.cos(angle) * radius * 0.25, bossPos.y + radius * 0.42);
    ctx.quadraticCurveTo(bossPos.x + Math.cos(angle) * radius * 0.5, y, x, y + radius * 0.35);
    ctx.stroke();
  }

  ctx.beginPath();
  ctx.fillStyle = state.boss.frenzy ? "#7f1a3d" : "#0f365e";
  ctx.arc(bossPos.x, bossPos.y, radius, 0, Math.PI * 2);
  ctx.fill();

  ctx.beginPath();
  ctx.fillStyle = state.boss.frenzy ? "#c53e6b" : "#2f6ea7";
  ctx.arc(bossPos.x, bossPos.y - radius * 0.18, radius * 0.88, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#f2fbff";
  ctx.beginPath();
  ctx.arc(bossPos.x - radius * 0.25, bossPos.y - radius * 0.18, radius * 0.12, 0, Math.PI * 2);
  ctx.arc(bossPos.x + radius * 0.25, bossPos.y - radius * 0.18, radius * 0.12, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#040e18";
  ctx.beginPath();
  ctx.arc(bossPos.x - radius * 0.25, bossPos.y - radius * 0.18, radius * 0.05, 0, Math.PI * 2);
  ctx.arc(bossPos.x + radius * 0.25, bossPos.y - radius * 0.18, radius * 0.05, 0, Math.PI * 2);
  ctx.fill();

  const hpW = radius * 2.25;
  const hpH = projection.scale * 22;
  const hpX = bossPos.x - hpW / 2;
  const hpY = bossPos.y - radius - projection.scale * 62;
  const hpRate = state.boss.hp / state.boss.maxHp;
  ctx.fillStyle = "rgba(15, 24, 40, 0.9)";
  ctx.fillRect(hpX, hpY, hpW, hpH);
  ctx.fillStyle = state.boss.frenzy ? "#ff658c" : "#49b8ff";
  ctx.fillRect(hpX, hpY, hpW * hpRate, hpH);
  ctx.strokeStyle = "rgba(211, 232, 255, 0.55)";
  ctx.strokeRect(hpX, hpY, hpW, hpH);

  const smiteLineRate = state.boss.smiteDamage / state.boss.maxHp;
  const smiteX = hpX + hpW * smiteLineRate;
  ctx.strokeStyle = "#ffe18f";
  ctx.beginPath();
  ctx.moveTo(smiteX, hpY - 4);
  ctx.lineTo(smiteX, hpY + hpH + 4);
  ctx.stroke();
}

function drawPlayers(state, projection) {
  const localPlayerId = state.localPlayerId;
  state.players.forEach((player) => {
    const pos = project(player.position.x, player.position.y, projection);
    const radius = projection.scale * 34;
    ctx.beginPath();
    ctx.fillStyle = player.alive ? player.color : "rgba(120, 129, 146, 0.7)";
    ctx.arc(pos.x, pos.y, radius, 0, Math.PI * 2);
    ctx.fill();

    if (player.id === localPlayerId) {
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = Math.max(2, projection.scale * 3.5);
      ctx.stroke();
    }

    if (player.status.bind > 0) {
      ctx.strokeStyle = "#f6df8d";
      ctx.lineWidth = Math.max(2, projection.scale * 3);
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, radius + projection.scale * 8, 0, Math.PI * 2);
      ctx.stroke();
    }

    if (player.status.ink > 0) {
      ctx.fillStyle = "rgba(8, 10, 13, 0.6)";
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, radius * 0.7, 0, Math.PI * 2);
      ctx.fill();
    }

    const hpRate = Math.max(0, Math.min(1, player.hp / player.maxHp));
    const hpW = radius * 2.1;
    const hpH = projection.scale * 8;
    const hpX = pos.x - hpW / 2;
    const hpY = pos.y - radius - projection.scale * 20;
    ctx.fillStyle = "rgba(20, 30, 45, 0.86)";
    ctx.fillRect(hpX, hpY, hpW, hpH);
    ctx.fillStyle = player.color;
    ctx.fillRect(hpX, hpY, hpW * hpRate, hpH);

    ctx.fillStyle = "#f2f8ff";
    ctx.font = `${Math.max(11, projection.scale * 17)}px sans-serif`;
    ctx.textAlign = "center";
    ctx.fillText(player.name, pos.x, hpY - projection.scale * 7);
  });
}

function drawEffects(state, projection) {
  state.effects.forEach((effect) => {
    if (effect.kind === "shot" && effect.from && effect.to) {
      const from = project(effect.from.x, effect.from.y, projection);
      const to = project(effect.to.x, effect.to.y, projection);
      ctx.strokeStyle = effect.color;
      ctx.lineWidth = Math.max(1, projection.scale * 4);
      ctx.beginPath();
      ctx.moveTo(from.x, from.y);
      ctx.lineTo(to.x, to.y);
      ctx.stroke();
    } else if (effect.kind === "smiteCast" && effect.to) {
      const center = project(effect.to.x, effect.to.y, projection);
      const alpha = Math.max(0, effect.ttl / 0.45);
      ctx.strokeStyle = `rgba(255, 208, 255, ${0.9 * alpha})`;
      ctx.lineWidth = Math.max(2, projection.scale * 8);
      ctx.beginPath();
      ctx.arc(center.x, center.y, projection.scale * (120 + (1 - alpha) * 170), 0, Math.PI * 2);
      ctx.stroke();
    }
  });
}

function render(state, nowSec) {
  const projection = getProjection();
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawBackground(projection, nowSec);
  drawBoss(state, projection);
  drawEffects(state, projection);
  drawPlayers(state, projection);

  if (state.phase === "gameOver") {
    ctx.fillStyle = "rgba(4, 8, 14, 0.35)";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
}

buildCharacterOptions();
buildShopButtons();
resizeCanvas();
window.addEventListener("resize", resizeCanvas);

let previousTime = performance.now();
function gameLoop(now) {
  const dt = Math.min(0.04, (now - previousTime) / 1000);
  previousTime = now;

  applyKeyboardMovement();
  maybeSendCommands(dt);
  server.update(dt);
  const state = server.getState();

  updateHUD(state);
  render(state, now / 1000);

  if (!keyboard.attack) {
    inputState.attackPressed = attackBtn.classList.contains("pressed");
  }

  requestAnimationFrame(gameLoop);
}

requestAnimationFrame(gameLoop);
