const canvas = document.querySelector('#game');
const ctx = canvas.getContext('2d');
const message = document.querySelector('#message');
const restartButton = document.querySelector('#restart');

const zombieIcon = new Image();
zombieIcon.src = 'assets/zombie-icon.png';
const speedyZombieIcon = new Image();
speedyZombieIcon.src = 'assets/speedy-zombie.png';
const bigZombieIcon = new Image();
bigZombieIcon.src = 'assets/big-zombie.png';
const skeletonIcon = new Image();
skeletonIcon.src = 'assets/skeleton-icon.png';
const bowIcon = new Image();
bowIcon.src = 'assets/bow-reference.png';
const shotgunIcon = new Image();
shotgunIcon.src = 'assets/shotgun.png';
const bossKnightIcon = new Image();
bossKnightIcon.src = 'assets/boss-knight.png';
const bossSwordIcon = new Image();
bossSwordIcon.src = 'assets/boss-sword.png';
const fireEffectIcon = new Image();
fireEffectIcon.src = 'assets/fire-effect.png';
const droneIcon = new Image();
droneIcon.src = 'assets/drone.png';
const heartIcon = new Image();
heartIcon.src = 'assets/heart.png';
const witchIcon = new Image();
witchIcon.src = 'assets/witch-icon.png';
const wandIcon = new Image();
wandIcon.src = 'assets/wand-icon.png';
const witchMinionIcon = new Image();
witchMinionIcon.src = 'assets/witch-minion-icon.png';
const summonPatchIcon = new Image();
summonPatchIcon.src = 'assets/summon-patch.png';
const jesterBossIcon = new Image();
jesterBossIcon.src = 'assets/jester-boss.png';
const jesterBladeIcon = new Image();
jesterBladeIcon.src = 'assets/jester-blade.png';
const tankZombieIcon = new Image();
tankZombieIcon.src = 'assets/tank-zombie.png';
const tankShieldIcon = new Image();
tankShieldIcon.src = 'assets/tank-shield.png';

const keys = new Set();
const shots = [];
const enemyArrows = [];
const jesterBlades = [];
let droppedItems = [];
let drones = [];
let droneShots = [];
let turrets = [];
let turretShots = [];
let hasLaserRings = false;
let summonEffects = [];
let visualEffects = [];
let shellCasings = [];
let playerShotFlashUntil = 0;
let playerRecoilUntil = 0;
let witchSpawnQueue = [];
let nextWitchSpawnAt = 0;
let hasShotgun = false;
let normalGunDamageMultiplier = 1;
let shotgunDamageMultiplier = 1;
let droneDamageMultiplier = 1;
let laserRingDamageMultiplier = 1;
let lastWaveDamageBonusRound = 0;
const playerMaxHealth = 10;
const maxRounds = 100;
const skipUnlockDelayMs = 6000;
const player = { x: 130, y: 280, radius: 18, speed: 260, moveAngle: 0, isMoving: false, walkTime: 0 };

let zombies = [];
let lastTime = 0;
let lastShotTime = 0;
let alive = true;
let won = false;
let survivalTime = 0;
let round = 1;
let betweenWaves = false;
let nextWaveTime = 0;
let animationTime = 0;
let playerHealth = playerMaxHealth;
let roundEndsAt = 0;
let skipUnlocksAt = 0;
let waveSpawnQueue = [];
let spawnQueues = {};
let nextSpawnAt = {};
let skeletonSpawnQueue = [];
let nextSkeletonSpawnAt = 0;
let spawnSequence = 0;

function zombieCountForRound(roundNumber) {
  let count = 2 * roundNumber + 3;
  if (roundNumber > 10) {
    count = Math.round(count * 1.2);
  }
  if (roundNumber > 15) count = Math.round(count * 1.3);
  return count;
}

function randomInt(min, max) {
  return min + Math.floor(Math.random() * (max - min + 1));
}

function speedyCountForRound(roundNumber) {
  if (roundNumber < 3) return 0;
  if (roundNumber <= 10) return randomInt(2, 4);
  if (roundNumber < 15) return randomInt(3, 5);
  return randomInt(4, 6);
}

function tankCountForRound(roundNumber) {
  if (roundNumber <= 15) return 0;
  if (roundNumber === 20) return 6;
  if (roundNumber > 20) return randomInt(5, 7);
  return randomInt(3, 4);
}

function enemySpawnInterval() {
  const base = round >= 10 ? 400 : (round >= 5 ? 600 : 800);
  return round > 15 ? base * 1.2 : base;
}

function spawnIntervalFor(type) {
  const base = type === 'speedy' ? 520
    : type === 'tank' ? 1300
      : type === 'big' ? 900
        : type === 'minion' ? 620
          : type === 'knight_boss' ? 1500
            : type === 'jester_boss' ? 2000
              : enemySpawnInterval();
  return round > 15 ? base * 1.2 : base;
}

function prepareSpawnQueues(now) {
  spawnQueues = {};
  nextSpawnAt = {};
  for (const entry of waveSpawnQueue) {
    if (!spawnQueues[entry.type]) spawnQueues[entry.type] = [];
    spawnQueues[entry.type].push(entry);
  }
  for (const [type, entries] of Object.entries(spawnQueues)) {
    for (const entry of entries) {
      if (entry.roundDelay !== undefined) entry.scheduledAt = now + entry.roundDelay;
    }
    entries.sort((first, second) => (first.scheduledAt || 0) - (second.scheduledAt || 0));
    nextSpawnAt[type] = entries[0].scheduledAt || now + (entries[0].customDelay || spawnIntervalFor(type));
  }
  waveSpawnQueue = [];
}

function hasPendingWaveEnemies() {
  return Object.values(spawnQueues).some((entries) => entries.length > 0);
}

function findSafeSpawn(radius, occupied, distanceBlocks) {
  for (let attempt = 0; attempt < 250; attempt++) {
    const angle = Math.random() * Math.PI * 2;
    const distance = (distanceBlocks + (Math.random() - 0.5) * 1.4) * 40;
    const candidate = {
      x: player.x + Math.cos(angle) * distance,
      y: player.y + Math.sin(angle) * distance,
    };
    const insideArena = candidate.x >= radius + 12 && candidate.x <= canvas.width - radius - 12
      && candidate.y >= radius + 12 && candidate.y <= canvas.height - radius - 12;
    const awayFromZombies = occupied.every((zombie) =>
      Math.hypot(candidate.x - zombie.x, candidate.y - zombie.y) > radius + zombie.radius + 14,
    );
    if (insideArena && awayFromZombies) return candidate;
  }

  // Very late waves can fill the arena; the collision solver separates this fallback spawn.
  return { x: canvas.width - radius - 12, y: canvas.height - radius - 12 };
}

function makeZombie(type, index, occupied) {
  const radius = type === 'jester_boss' ? 62 : type === 'tank' ? 50 : type === 'knight_boss' ? 48 : type === 'big' ? 42 : type === 'witch' ? 30 : type === 'minion' || type === 'witch_minion' ? 20 : 28;
  const distanceBlocks = type === 'jester_boss' || type === 'tank' || type === 'knight_boss' || type === 'big' || type === 'skeleton' || type === 'witch' ? 14 : type === 'speedy' ? 12 : 8;
  const spawn = findSafeSpawn(radius, occupied, distanceBlocks);
  const normalSpeed = 38 + (index % 3) * 5;

  let maxHits;
  if (type === 'jester_boss') maxHits = 200;
  else if (type === 'tank') maxHits = 60;
  else if (type === 'knight_boss') maxHits = 75;
  else if (type === 'big') maxHits = 7;
  else if (type === 'speedy' || type === 'minion') maxHits = 2;
  else if (type === 'witch_minion') maxHits = 2;
  else if (type === 'witch') maxHits = 8;
  else maxHits = 3;

  const postTwentyHpMultiplier = Math.pow(1.3, Math.floor(Math.max(0, round - 20) / 5));
  maxHits = Math.ceil(maxHits * postTwentyHpMultiplier);

  if (round > 10 && type !== 'witch_minion' && type !== 'jester_boss' && type !== 'knight_boss') {
    maxHits = Math.round(maxHits * 1.5);
  }
  if (round > 15) maxHits = Math.ceil(maxHits * 1.2);

  let maxShieldHits = type === 'tank' ? 30 : 0;
  maxShieldHits = Math.ceil(maxShieldHits * postTwentyHpMultiplier);
  if (type === 'tank' && round > 10) maxShieldHits = Math.round(maxShieldHits * 1.5);
  if (type === 'tank' && round > 15) maxShieldHits = Math.ceil(maxShieldHits * 1.2);

  const speed = type === 'jester_boss' ? 40 : type === 'tank' ? 28 : type === 'knight_boss' ? 55 : type === 'speedy' ? normalSpeed * 1.5 : type === 'big' ? normalSpeed * 0.7 : type === 'witch' ? normalSpeed * 0.6 : normalSpeed;
  return {
    x: spawn.x,
    y: spawn.y,
    radius,
    speed,
    hits: 0,
    maxHits,
    shieldHits: 0,
    maxShieldHits,
    shieldFlashUntil: 0,
    type,
    phase: Math.random() * Math.PI * 2,
    nextAttackTime: 0,
    attackUntil: 0,
    nextArrowTime: type === 'skeleton' ? performance.now() + 3000 : 0,
    bowUntil: 0,
    attackStartTime: 0,
    // witch state
    witchPhase: type === 'witch' ? 'moving' : null,
    witchMoveUntil: type === 'witch' ? performance.now() + 3000 : 0,
    witchChannelUntil: 0,
    witchNextSummonAt: 0,
    witchSummonsLeft: 0,
    witchNextCooldownEnd: 0,
    witchWandAngle: -Math.PI / 2,
    // jester state
    jesterHandAngle: Math.random() * Math.PI * 2,
    jesterHandPhase: 'orbit', // 'orbit' | 'windup' | 'slam'
    jesterNextSlamAt: type === 'jester_boss' ? performance.now() + 3000 : 0,
    jesterSlamStart: 0,
    jesterSlamDamaged: false,
    jesterBladePhase: 'idle', // 'idle' | 'charging'
    jesterBladeStart: 0,
    jesterBladeNextAt: type === 'jester_boss' ? performance.now() + 5000 : 0,
    jesterBladeCycle: 0,
    enteredAt: performance.now(),
    hitFlashUntil: 0,
    hitAngle: 0,
    shieldRecoilUntil: 0,
    shieldBroken: false,
  };
}

function makeBigMinion(index, occupied, big) {
  const minion = makeZombie('minion', index, occupied);
  const dx = player.x - big.x;
  const dy = player.y - big.y;
  const length = Math.hypot(dx, dy) || 1;
  const forwardX = dx / length;
  const forwardY = dy / length;
  const sideX = -forwardY;
  const sideY = forwardX;
  const minionNumber = index % 3;
  const sideOffset = (minionNumber - 1) * 38;
  const candidate = {
    x: big.x + forwardX * 76 + sideX * sideOffset,
    y: big.y + forwardY * 76 + sideY * sideOffset,
  };
  const insideArena = candidate.x >= minion.radius && candidate.x <= canvas.width - minion.radius
    && candidate.y >= minion.radius && candidate.y <= canvas.height - minion.radius;
  const clearOfOthers = occupied.every((zombie) =>
    Math.hypot(candidate.x - zombie.x, candidate.y - zombie.y) > minion.radius + zombie.radius + 6,
  );
  if (insideArena && clearOfOthers) {
    minion.x = candidate.x;
    minion.y = candidate.y;
  }
  return minion;
}

function placeNearBossGroup(zombie, groupId) {
  const anchor = zombies.find((enemy) => enemy.bossGroupId === groupId);
  if (!anchor) return;
  for (let attempt = 0; attempt < 40; attempt++) {
    const angle = Math.random() * Math.PI * 2;
    const distance = 95 + Math.random() * 65;
    const x = anchor.x + Math.cos(angle) * distance;
    const y = anchor.y + Math.sin(angle) * distance;
    const insideArena = x >= zombie.radius + 12 && x <= canvas.width - zombie.radius - 12
      && y >= zombie.radius + 12 && y <= canvas.height - zombie.radius - 12;
    const clear = zombies.every((enemy) => Math.hypot(x - enemy.x, y - enemy.y) > zombie.radius + enemy.radius + 12);
    if (insideArena && clear) {
      zombie.x = x;
      zombie.y = y;
      return;
    }
  }
}

function startWave() {
  applyWaveDamageBonus();
  const normalCount = zombieCountForRound(round);
  waveSpawnQueue = Array.from({ length: normalCount }, () => ({ type: 'normal' }));
  const speedyCount = speedyCountForRound(round);
  for (let i = 0; i < speedyCount; i++) {
    waveSpawnQueue.push({ type: 'speedy' });
  }
  const tankCount = tankCountForRound(round);
  for (let i = 0; i < tankCount; i++) waveSpawnQueue.push({ type: 'tank', roundDelay: randomInt(3000, 5000) });

  if (round === 15) {
    waveSpawnQueue.push({ type: 'knight_boss', roundDelay: randomInt(4000, 7000) });
    waveSpawnQueue.push({ type: 'jester_boss', roundDelay: randomInt(5000, 8000) });
  } else if (round % 10 === 0) {
    const bossGroupId = `boss-${round}`;
    waveSpawnQueue.push({ type: 'big', customDelay: 500, bossGroupId });
    waveSpawnQueue.push({ type: 'big', customDelay: 500, bossGroupId });
    waveSpawnQueue.push({ type: 'big', customDelay: 2000, bossGroupId });
    waveSpawnQueue.push({ type: 'knight_boss', bossGroupId, roundDelay: randomInt(4000, 7000) });
  } else if (round % 5 === 0) {
    const groupId = `big-${round}`;
    waveSpawnQueue.push({ type: 'big', groupId });
    for (let minionIndex = 0; minionIndex < 3; minionIndex++) {
      waveSpawnQueue.push({ type: 'minion', groupId, minionIndex });
    }
  } else if (round === 9) {
    waveSpawnQueue.push({ type: 'big' });
    waveSpawnQueue.push({ type: 'big' });
  } else if (round >= 6 && round <= 8) {
    waveSpawnQueue.push({ type: 'big' });
  }

  skeletonSpawnQueue = round >= 6
    ? Array.from({ length: 2 + Math.floor(Math.random() * 3) }, () => ({ type: 'skeleton' }))
    : [];

  betweenWaves = false;
  const now = performance.now();
  // Boss rounds (multiples of 5, including 15) are Infinity duration
  const isBossRound = round % 5 === 0 || round === 15;
  const roundDurationMs = isBossRound ? Infinity : 20000;
  roundEndsAt = now + roundDurationMs;
  skipUnlocksAt = now + skipUnlockDelayMs;
  prepareSpawnQueues(now);
  nextSkeletonSpawnAt = now + (round > 15 ? 1200 : 1000);
  const additions = [];
  if (speedyCount > 0) additions.push(`${speedyCount} SPEEDY`);
  if (tankCount > 0) additions.push(`${tankCount} TANK`);
  if (round === 15) additions.push('KNIGHT BOSS (75 HP) + JESTER BOSS (200 HP)');
  else if (round % 10 === 0) additions.push('KNIGHT BOSS (75 HP)');
  else if (round % 5 === 0) additions.push('1 BIG + 3 MINIONS');
  else if (round === 9) additions.push('2 BIG');
  else if (round >= 6) additions.push('1 BIG');
  if (skeletonSpawnQueue.length > 0) additions.push(`${skeletonSpawnQueue.length} SKELETONS`);

  // Witch spawn queue after wave 10
  if (round > 10) {
    const witchCount = round >= 19 ? 5 : randomInt(2, 4);
    witchSpawnQueue = Array.from({ length: witchCount }, () => ({ type: 'witch' }));
    nextWitchSpawnAt = now + 2000;
    additions.push(`${witchCount} WITCHES`);
  } else {
    witchSpawnQueue = [];
  }

  message.textContent = `ROUND ${round}: ${normalCount} normal${additions.length ? ` + ${additions.join(' + ')}` : ''}`;
}

function applyWaveDamageBonus() {
  if (round % 5 !== 0 || lastWaveDamageBonusRound === round) return;
  lastWaveDamageBonusRound = round;
  if (hasShotgun) shotgunDamageMultiplier *= 1.05;
  else normalGunDamageMultiplier *= 1.05;
  if (drones.length > 0) droneDamageMultiplier *= 1.05;
  if (hasLaserRings) laserRingDamageMultiplier *= 1.05;
}

window.addEventListener('keydown', (event) => {
  const key = event.key.toLowerCase();
  if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(key)) {
    event.preventDefault();
    keys.add(key);
  }
  if (event.key === 'Enter') {
    event.preventDefault();
    if (!event.repeat) skipCurrentRound();
  }
});

function clearMovementKeys() {
  keys.clear();
  player.isMoving = false;
}

window.addEventListener('blur', clearMovementKeys);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) clearMovementKeys();
});
window.addEventListener('keyup', (event) => keys.delete(event.key.toLowerCase()));
window.addEventListener('resize', resizeGame);
canvas.addEventListener('contextmenu', (event) => event.preventDefault());
restartButton.addEventListener('click', resetGame);

function resizeGame() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  keepInsideArena(player);
  for (const zombie of zombies) keepInsideArena(zombie);
}

function resetGame() {
  player.x = canvas.width * 0.5;
  player.y = canvas.height * 0.5;
  playerHealth = playerMaxHealth;
  zombies = [];
  shots.length = 0;
  enemyArrows.length = 0;
  jesterBlades.length = 0;
  droppedItems = [];
  drones = [];
  droneShots = [];
  turrets = [];
  turretShots = [];
  hasLaserRings = false;
  summonEffects = [];
  visualEffects = [];
  shellCasings = [];
  witchSpawnQueue = [];
  hasShotgun = false;
  normalGunDamageMultiplier = 1;
  shotgunDamageMultiplier = 1;
  droneDamageMultiplier = 1;
  laserRingDamageMultiplier = 1;
  lastWaveDamageBonusRound = 0;
  waveSpawnQueue = [];
  spawnQueues = {};
  nextSpawnAt = {};
  skeletonSpawnQueue = [];
  spawnSequence = 0;
  survivalTime = 0;
  animationTime = 0;
  round = 1;
  alive = true;
  won = false;
  betweenWaves = false;
  lastShotTime = 0;
  lastTime = performance.now();
  restartButton.hidden = true;
  startWave();
  requestAnimationFrame(gameLoop);
}

function isBossWave() {
  return round % 5 === 0 || round % 10 === 0;
}

function canSkipCurrentRound() {
  return alive && !won && !betweenWaves && performance.now() >= skipUnlocksAt
    && !isBossWave();
}

function skipCurrentRound() {
  if (!canSkipCurrentRound()) return;
  // Existing enemies stay alive. Only the remaining unspawned enemies of this round are skipped.
  waveSpawnQueue = [];
  spawnQueues = {};
  nextSpawnAt = {};
  skeletonSpawnQueue = [];
  witchSpawnQueue = [];
  clearProjectiles();
  if (round >= maxRounds) {
    won = true;
    message.textContent = `You finished all ${maxRounds} rounds!`;
    restartButton.hidden = false;
    return;
  }
  round += 1;
  startWave();
}

function clearProjectiles() {
  shots.length = 0;
  enemyArrows.length = 0;
  jesterBlades.length = 0;
  droneShots.length = 0;
  turretShots.length = 0;
}

function spawnNextEnemy() {
  const now = performance.now();
  for (const [type, queue] of Object.entries(spawnQueues)) {
    if (queue.length === 0 || now < nextSpawnAt[type]) continue;
    const entry = queue.shift();
    let zombie;
    if (entry.type === 'minion') {
      const big = zombies.find((enemy) => enemy.groupId === entry.groupId && enemy.type === 'big');
      zombie = big ? makeBigMinion(entry.minionIndex, zombies, big) : makeZombie('minion', spawnSequence, zombies);
    } else {
      zombie = makeZombie(entry.type, spawnSequence, zombies);
      zombie.groupId = entry.groupId;
    }
    if (entry.bossGroupId) {
      placeNearBossGroup(zombie, entry.bossGroupId);
      zombie.bossGroupId = entry.bossGroupId;
    }
    zombies.push(zombie);
    spawnSequence += 1;
    nextSpawnAt[type] = queue[0]?.scheduledAt || now + (entry.customDelay || spawnIntervalFor(type));
  }
}

function spawnNextSkeleton() {
  const now = performance.now();
  if (skeletonSpawnQueue.length === 0 || now < nextSkeletonSpawnAt) return;
  skeletonSpawnQueue.shift();
  zombies.push(makeZombie('skeleton', spawnSequence, zombies));
  spawnSequence += 1;
  nextSkeletonSpawnAt = now + (round > 15 ? 1200 : 1000);
}

function shootNearestZombie() {
  if (!alive || won || zombies.length === 0) return;
  const now = performance.now();
  const cooldown = hasShotgun ? 600 : 300;
  if (now - lastShotTime < cooldown) return;
  lastShotTime = now;

  let target = null;
  let shortestDistance = Infinity;
  for (const zombie of zombies) {
    if (performance.now() < (zombie.spawnShieldUntil || 0)) continue;
    const distance = Math.hypot(zombie.x - player.x, zombie.y - player.y);
    if (distance < shortestDistance) {
      shortestDistance = distance;
      target = zombie;
    }
  }
  if (!target) return;
  const dx = target.x - player.x;
  const dy = target.y - player.y;
  const baseAngle = Math.atan2(dy, dx);
  // Shotgun: 6 bullets spread; normal: 1 bullet
  const angles = hasShotgun
    ? [baseAngle - 0.5, baseAngle - 0.3, baseAngle - 0.1, baseAngle + 0.1, baseAngle + 0.3, baseAngle + 0.5]
    : [baseAngle];

  for (const angle of angles) {
    shots.push({
      x: player.x,
      y: player.y,
      startX: player.x,
      startY: player.y,
      vx: Math.cos(angle) * 1100,
      vy: Math.sin(angle) * 1100,
      angle: angle,
      life: 0.75,
      isShotgun: hasShotgun,
      damageMultiplier: hasShotgun ? shotgunDamageMultiplier : normalGunDamageMultiplier,
    });
  }
  playerShotFlashUntil = now + 90;
  playerRecoilUntil = now + 120;
  if (hasShotgun) {
    shellCasings.push({ x: player.x, y: player.y, angle: baseAngle - Math.PI / 2, spawnTime: now, life: 650 });
  }
}

function spawnNextWitch() {
  const now = performance.now();
  if (witchSpawnQueue.length === 0 || now < nextWitchSpawnAt) return;
  witchSpawnQueue.shift();
  zombies.push(makeZombie('witch', spawnSequence, zombies));
  spawnSequence += 1;
  nextWitchSpawnAt = now + (round > 15 ? 1800 : 1500);
}

function updatePlayer(delta) {
  let xDirection = 0;
  let yDirection = 0;
  if (keys.has('w') || keys.has('arrowup')) yDirection -= 1;
  if (keys.has('s') || keys.has('arrowdown')) yDirection += 1;
  if (keys.has('a') || keys.has('arrowleft')) xDirection -= 1;
  if (keys.has('d') || keys.has('arrowright')) xDirection += 1;
  const length = Math.hypot(xDirection, yDirection) || 1;
  player.isMoving = xDirection !== 0 || yDirection !== 0;
  if (player.isMoving) player.walkTime += delta;
  if (player.isMoving) player.moveAngle = Math.atan2(yDirection, xDirection);
  player.x += (xDirection / length) * player.speed * delta;
  player.y += (yDirection / length) * player.speed * delta;
  keepInsideArena(player);
}

function keepInsideArena(entity) {
  entity.x = Math.max(entity.radius, Math.min(canvas.width - entity.radius, entity.x));
  entity.y = Math.max(entity.radius, Math.min(canvas.height - entity.radius, entity.y));
}

function separateBodies(first, second) {
  let dx = second.x - first.x;
  let dy = second.y - first.y;
  let distance = Math.hypot(dx, dy);
  const minimumDistance = first.radius + second.radius;
  if (distance >= minimumDistance) return;
  if (distance === 0) {
    dx = 1;
    dy = 0;
    distance = 1;
  }
  const push = (minimumDistance - distance) / 2;
  const unitX = dx / distance;
  const unitY = dy / distance;
  first.x -= unitX * push;
  first.y -= unitY * push;
  second.x += unitX * push;
  second.y += unitY * push;
  keepInsideArena(first);
  keepInsideArena(second);
}

function resolveHitboxes() {
  // Three passes make player/zombie and zombie/zombie bodies act as solid barriers.
  for (let pass = 0; pass < 3; pass++) {
    for (const zombie of zombies) separateBodies(player, zombie);
    for (let first = 0; first < zombies.length; first++) {
      for (let second = first + 1; second < zombies.length; second++) {
        separateBodies(zombies[first], zombies[second]);
      }
    }
  }
}

function damageEnemy(zombie, damage) {
  const now = performance.now();
  if (zombie.type === 'tank' && zombie.shieldHits < zombie.maxShieldHits) {
    zombie.shieldHits = Math.min(zombie.maxShieldHits, zombie.shieldHits + damage);
    zombie.shieldFlashUntil = now + 120;
    zombie.shieldRecoilUntil = now + 180;
    visualEffects.push({ type: 'sparks', x: zombie.x, y: zombie.y, spawnTime: now, life: 220, color: '#8eeaff' });
    if (zombie.shieldHits >= zombie.maxShieldHits && !zombie.shieldBroken) {
      zombie.shieldBroken = true;
      visualEffects.push({ type: 'shatter', x: zombie.x, y: zombie.y, spawnTime: now, life: 700, color: '#a9c8e8' });
    }
    return;
  }
  zombie.hits += damage;
  zombie.hitFlashUntil = now + 120;
  zombie.hitAngle = Math.atan2(zombie.y - player.y, zombie.x - player.x);
  visualEffects.push({ type: 'sparks', x: zombie.x, y: zombie.y, spawnTime: now, life: 180, color: '#ffb35c' });
}

function updateShots(delta) {
  for (let shotIndex = shots.length - 1; shotIndex >= 0; shotIndex--) {
    const shot = shots[shotIndex];
    shot.x += shot.vx * delta;
    shot.y += shot.vy * delta;
    shot.life -= delta;
    let hit = false;
    for (const zombie of zombies) {
      if (performance.now() >= (zombie.spawnShieldUntil || 0) && Math.hypot(shot.x - zombie.x, shot.y - zombie.y) < zombie.radius + 5) {
        let dmg = 1;
        if (shot.isShotgun) {
          const dist = Math.hypot(shot.x - shot.startX, shot.y - shot.startY);
          const blocks = dist / 40; // 40px per block
          if (blocks < 5) dmg = 3;
          else if (blocks < 10) dmg = 2;
          else dmg = 1;
        }
        dmg *= shot.damageMultiplier;
        damageEnemy(zombie, dmg);
        hit = true;
        break;
      }
    }
    if (hit || shot.life <= 0) shots.splice(shotIndex, 1);
  }
  for (const zombie of zombies) {
    if (zombie.hits >= zombie.maxHits && !zombie.droppedItem) {
      zombie.droppedItem = true;
      if (zombie.type === 'big' && !hasShotgun) {
        // First big kill before wave 5 was shotgun; after wave 5 it's a heart
        if (round <= 5) {
          droppedItems.push({
            type: 'shotgun',
            x: zombie.x,
            y: zombie.y,
            spawnTime: performance.now(),
            isMagnetized: false,
            speed: 120,
          });
        } else {
          droppedItems.push({
            type: 'heart',
            x: zombie.x,
            y: zombie.y,
            spawnTime: performance.now(),
            isMagnetized: false,
            speed: 120,
          });
        }
      } else if (zombie.type === 'big' && hasShotgun) {
        // Already have shotgun – always drop heart
        droppedItems.push({
          type: 'heart',
          x: zombie.x,
          y: zombie.y,
          spawnTime: performance.now(),
          isMagnetized: false,
          speed: 120,
        });
      } else if (zombie.type === 'knight_boss') {
        droppedItems.push({
          type: 'drone_pack',
          droneCount: 2,
          x: zombie.x,
          y: zombie.y,
          spawnTime: performance.now(),
          isMagnetized: false,
          speed: 120,
        });
      } else if (zombie.type === 'jester_boss' && round === 15) {
        droppedItems.push({ type: 'laser_rings', x: zombie.x - 26, y: zombie.y, spawnTime: performance.now(), isMagnetized: false, speed: 120 });
        droppedItems.push({ type: 'drone_pack', droneCount: 3, x: zombie.x + 26, y: zombie.y, spawnTime: performance.now(), isMagnetized: false, speed: 120 });
      }
    }
  }
  for (const zombie of zombies) {
    if (zombie.hits >= zombie.maxHits && !zombie.deathEffectAdded) {
      zombie.deathEffectAdded = true;
      visualEffects.push({ type: 'death', x: zombie.x, y: zombie.y, radius: zombie.radius, spawnTime: performance.now(), life: 520, color: zombie.type === 'witch' ? '#c15cff' : '#a6d881' });
    }
  }
  zombies = zombies.filter((zombie) => zombie.hits < zombie.maxHits);
}

function updateDroppedItems(delta) {
  for (let i = droppedItems.length - 1; i >= 0; i--) {
    const item = droppedItems[i];
    const dx = player.x - item.x;
    const dy = player.y - item.y;
    const dist = Math.hypot(dx, dy) || 1;

    if (dist < 160) {
      item.isMagnetized = true;
    }

    if (item.isMagnetized) {
      item.speed += 700 * delta;
      const move = Math.min(dist, item.speed * delta);
      item.x += (dx / dist) * move;
      item.y += (dy / dist) * move;
    }

    if (dist < player.radius + 18) {
      if (item.type === 'shotgun') {
        hasShotgun = true;
        message.textContent = 'YOU PICKED UP THE SHOTGUN! (6 spread shots every 0.6s)';
      } else if (item.type === 'heart') {
        playerHealth = Math.min(playerHealth + 3, 13);
        message.textContent = `+3 HP! (${playerHealth} / ${Math.max(playerMaxHealth, playerHealth)})`;
      } else if (item.type === 'drone_pack') {
        const droneCount = item.droneCount || 2;
        for (let droneIndex = 0; droneIndex < droneCount; droneIndex++) {
          drones.push({ x: player.x, y: player.y, aimAngle: 0, nextShotAt: 0 });
        }
        message.textContent = `YOU UNLOCKED ${droneCount} MORE COMPANION DRONES!`;
      } else if (item.type === 'laser_rings') {
        hasLaserRings = true;
        message.textContent = 'YOU UNLOCKED LASER RINGS!';
      }
      droppedItems.splice(i, 1);
    }
  }
}

function updateDrones(delta) {
  const now = performance.now();
  // Move drone shots
  for (let i = droneShots.length - 1; i >= 0; i--) {
    const s = droneShots[i];
    s.x += s.vx * delta;
    s.y += s.vy * delta;
    s.life -= delta;
    let hit = false;
    for (const zombie of zombies) {
      if (performance.now() >= (zombie.spawnShieldUntil || 0) && Math.hypot(s.x - zombie.x, s.y - zombie.y) < zombie.radius + 5) {
        damageEnemy(zombie, droneDamageMultiplier);
        hit = true;
        break;
      }
    }
    if (hit || s.life <= 0) droneShots.splice(i, 1);
  }

  if (drones.length === 0) return;

  for (let i = 0; i < drones.length; i++) {
    const drone = drones[i];
    const hoverAngle = animationTime * 1.6 + (i * Math.PI * 2 / drones.length);
    const targetX = player.x + Math.cos(hoverAngle) * 66;
    const targetY = player.y + Math.sin(hoverAngle) * 66;

    drone.x += (targetX - drone.x) * 6 * delta;
    drone.y += (targetY - drone.y) * 6 * delta;

    let target = null;
    let shortestDist = 550;
    for (const z of zombies) {
      if (now < (z.spawnShieldUntil || 0)) continue;
      const dist = Math.hypot(z.x - drone.x, z.y - drone.y);
      if (dist < shortestDist) {
        shortestDist = dist;
        target = z;
      }
    }

    if (target) {
      drone.aimAngle = Math.atan2(target.y - drone.y, target.x - drone.x);
      // Random delay between 0 and 500ms (average ~250ms) — checked per-frame
      if (!drone.nextShotAt) drone.nextShotAt = now + 300;
      if (now >= drone.nextShotAt) {
        drone.nextShotAt = now + 300;
        const angle = drone.aimAngle;
        droneShots.push({
          x: drone.x,
          y: drone.y,
          vx: Math.cos(angle) * 900,
          vy: Math.sin(angle) * 900,
          angle,
          life: 0.7,
        });
      }
    } else {
      drone.aimAngle = hoverAngle;
      drone.nextShotAt = 0;
    }
  }
}

function updateTurrets(delta) {
  const now = performance.now();
  for (let i = turretShots.length - 1; i >= 0; i--) {
    const shot = turretShots[i];
    shot.x += shot.vx * delta;
    shot.y += shot.vy * delta;
    shot.life -= delta;
    const hit = zombies.find((zombie) => performance.now() >= (zombie.spawnShieldUntil || 0)
      && Math.hypot(shot.x - zombie.x, shot.y - zombie.y) < zombie.radius + shot.radius);
    if (hit) damageEnemy(hit, 3);
    if (hit || shot.life <= 0) turretShots.splice(i, 1);
  }

  for (let i = 0; i < turrets.length; i++) {
    const turret = turrets[i];
    const followAngle = animationTime * 0.75 + i * Math.PI * 2 / turrets.length;
    const targetX = player.x + Math.cos(followAngle) * 80;
    const targetY = player.y + Math.sin(followAngle) * 80;
    turret.x += (targetX - turret.x) * 5 * delta;
    turret.y += (targetY - turret.y) * 5 * delta;
    keepInsideArena(turret);

    for (const zombie of zombies) {
      let dx = zombie.x - turret.x;
      let dy = zombie.y - turret.y;
      let distance = Math.hypot(dx, dy) || 1;
      const minimum = turret.radius + zombie.radius;
      if (distance < minimum) {
        const push = (minimum - distance) * 0.38;
        zombie.x += (dx / distance) * push;
        zombie.y += (dy / distance) * push;
        turret.x -= (dx / distance) * push * 0.35;
        turret.y -= (dy / distance) * push * 0.35;
      }
    }

    let target = null;
    let closest = 540;
    for (const zombie of zombies) {
      const distance = Math.hypot(zombie.x - turret.x, zombie.y - turret.y);
      if (distance < closest) { closest = distance; target = zombie; }
    }
    if (!target) continue;
    turret.aimAngle = Math.atan2(target.y - turret.y, target.x - turret.x);
    if (now >= turret.nextShotAt) {
      turret.nextShotAt = now + 500;
      turretShots.push({ x: turret.x, y: turret.y, vx: Math.cos(turret.aimAngle) * 780, vy: Math.sin(turret.aimAngle) * 780, radius: 6, life: 0.9, angle: turret.aimAngle });
    }
  }
}

function updateLaserRings() {
  if (!hasLaserRings) return;
  const now = performance.now();
  const ringRadius = 5 * 40;
  const ringThickness = 13;
  for (const zombie of zombies) {
    const distance = Math.hypot(zombie.x - player.x, zombie.y - player.y);
    const touchingRing = Math.abs(distance - ringRadius) <= zombie.radius + ringThickness;
    if (touchingRing && now >= (zombie.laserRingNextHitAt || 0)) {
      zombie.laserRingNextHitAt = now + 400;
      damageEnemy(zombie, 3 * laserRingDamageMultiplier);
    }
  }
}

function damagePlayer(amount) {
  playerHealth = Math.max(0, playerHealth - amount);
  if (playerHealth === 0) {
    alive = false;
    message.textContent = `You were overwhelmed after ${survivalTime.toFixed(1)} seconds.`;
    restartButton.hidden = false;
    return true;
  }
  return false;
}

function shootArrow(skeleton) {
  const dx = player.x - skeleton.x;
  const dy = player.y - skeleton.y;
  const length = Math.hypot(dx, dy) || 1;
  enemyArrows.push({
    x: skeleton.x,
    y: skeleton.y,
    vx: (dx / length) * 430,
    vy: (dy / length) * 430,
    angle: Math.atan2(dy, dx),
    life: 2.4,
  });
}

function updateEnemyArrows(delta) {
  for (let index = enemyArrows.length - 1; index >= 0; index--) {
    const arrow = enemyArrows[index];
    const previousX = arrow.x;
    const previousY = arrow.y;
    arrow.x += arrow.vx * delta;
    arrow.y += arrow.vy * delta;
    arrow.life -= delta;
    const segmentX = arrow.x - previousX;
    const segmentY = arrow.y - previousY;
    const segmentLengthSq = segmentX * segmentX + segmentY * segmentY || 1;
    const projection = Math.max(0, Math.min(1, ((player.x - previousX) * segmentX + (player.y - previousY) * segmentY) / segmentLengthSq));
    const closestX = previousX + segmentX * projection;
    const closestY = previousY + segmentY * projection;
    const hitPlayer = Math.hypot(closestX - player.x, closestY - player.y) < player.radius + 9;
    if (hitPlayer) damagePlayer(0.5);
    if (hitPlayer || arrow.life <= 0) enemyArrows.splice(index, 1);
  }
}

function startJesterBladeVolley(jester, now) {
  const count = jester.jesterBladeCycle === 0 ? 4 : jester.jesterBladeCycle === 1 ? 8 : 10;
  const cardinalSides = [0, Math.PI / 2, Math.PI, -Math.PI / 2];
  jester.jesterBladePhase = 'charging';
  jester.jesterBladeStart = now;
  jester.jesterBladeCycle += 1;
  for (let bladeNumber = 0; bladeNumber < count; bladeNumber++) {
    const side = cardinalSides[Math.floor(Math.random() * cardinalSides.length)];
    jesterBlades.push({
      owner: jester,
      side,
      orbitOffset: bladeNumber * (Math.PI * 2 / count),
      laneOffset: (bladeNumber - (count - 1) / 2) * 18,
      sideways: (Math.random() - 0.5) * 2.25,
      x: jester.x,
      y: jester.y,
      phase: 'fade',
      spawnTime: now,
      launchTime: 0,
      speed: 0,
      rotation: Math.random() * Math.PI * 2,
    });
  }
}

function updateJesterBlades(delta) {
  const now = performance.now();
  for (const jester of zombies) {
    if (jester.type !== 'jester_boss' || jester.jesterBladePhase !== 'idle' || now < jester.jesterBladeNextAt) continue;
    startJesterBladeVolley(jester, now);
  }

  for (let index = jesterBlades.length - 1; index >= 0; index--) {
    const blade = jesterBlades[index];
    const chargeElapsed = now - blade.spawnTime;
    if (blade.phase === 'fade') {
      const orbitAngle = blade.side + Math.sin(chargeElapsed * 0.004 + blade.orbitOffset) * 0.22;
      const distance = 74 + Math.sin(chargeElapsed * 0.01 + blade.orbitOffset) * 6;
      blade.x = blade.owner.x + Math.cos(orbitAngle) * distance - Math.sin(blade.side) * blade.laneOffset;
      blade.y = blade.owner.y + Math.sin(orbitAngle) * distance + Math.cos(blade.side) * blade.laneOffset;
      blade.rotation += delta * (4.8 + chargeElapsed * 0.0096);
      if (chargeElapsed >= 2000) {
        blade.phase = 'launch';
        blade.launchTime = now;
        visualEffects.push({ type: 'shockwave', x: blade.x, y: blade.y, spawnTime: now, life: 340, color: '#ed64ff' });
        const targetX = player.x - blade.x;
        const targetY = player.y - blade.y;
        const targetLength = Math.hypot(targetX, targetY) || 1;
        blade.launchX = targetX / targetLength;
        blade.launchY = targetY / targetLength;
        blade.vx = (blade.launchX - blade.launchY * blade.sideways) * 90;
        blade.vy = (blade.launchY + blade.launchX * blade.sideways) * 90;
      }
    } else {
      blade.speed = Math.min(760, blade.speed + 820 * delta);
      blade.vx += (blade.launchX - blade.launchY * blade.sideways) * 1100 * delta;
      blade.vy += (blade.launchY + blade.launchX * blade.sideways) * 1100 * delta;
      const velocityLength = Math.hypot(blade.vx, blade.vy) || 1;
      blade.x += (blade.vx / velocityLength) * blade.speed * delta;
      blade.y += (blade.vy / velocityLength) * blade.speed * delta;
      blade.rotation += delta * 17.6;
      const hitPlayer = Math.hypot(blade.x - player.x, blade.y - player.y) < player.radius + 26;
      const expired = now - blade.launchTime > 2200
        || blade.x < -120 || blade.x > canvas.width + 120 || blade.y < -120 || blade.y > canvas.height + 120;
      if (hitPlayer) damagePlayer(2);
      if (hitPlayer || expired) {
        jesterBlades.splice(index, 1);
        continue;
      }
    }
  }

  for (const jester of zombies) {
    if (jester.type !== 'jester_boss' || jester.jesterBladePhase !== 'charging') continue;
    if (now - jester.jesterBladeStart >= 2000) {
      jester.jesterBladePhase = 'idle';
      jester.jesterBladeNextAt = now + 6000;
    }
  }
}

function updateWitches(delta) {
  const now = performance.now();
  for (const zombie of zombies) {
    if (zombie.type !== 'witch') continue;
    if (zombie.witchPhase === 'moving') {
      // Move toward player for 3s then start channeling
      if (now >= zombie.witchMoveUntil) {
        zombie.witchPhase = 'channeling';
        zombie.witchChannelUntil = now + 3000;
        zombie.witchNextSummonAt = now + 500;
        zombie.witchSummonsLeft = 6;
        // Animate wand lifting (angle goes from side to up)
        zombie.witchWandStartAngle = zombie.witchWandAngle;
        zombie.witchChannelStart = now;
      } else {
        const dx = player.x - zombie.x;
        const dy = player.y - zombie.y;
        const dist = Math.hypot(dx, dy) || 1;
        const attackRange = player.radius + zombie.radius + 5;
        if (dist > attackRange) {
          const move = Math.min(zombie.speed * delta, dist - attackRange);
          zombie.x += (dx / dist) * move;
          zombie.y += (dy / dist) * move;
        }
      }
    } else if (zombie.witchPhase === 'channeling') {
      // Animate wand raising
      const progress = Math.min((now - zombie.witchChannelStart) / 3000, 1);
      zombie.witchWandAngle = -Math.PI / 2 - progress * 0.6;

      // Try to summon minions every 0.5s
      if (zombie.witchSummonsLeft > 0 && now >= zombie.witchNextSummonAt) {
        zombie.witchNextSummonAt = now + 500;
        // Find a slot within 3 blocks of witch that is clear
        const spawnRadius = 3 * 40;
        let spawned = false;
        for (let attempt = 0; attempt < 20; attempt++) {
          const angle = Math.random() * Math.PI * 2;
          const dist = spawnRadius * (0.5 + Math.random() * 0.5);
          const cx = zombie.x + Math.cos(angle) * dist;
          const cy = zombie.y + Math.sin(angle) * dist;
          const minionRadius = 20;
          const insideArena = cx >= minionRadius + 12 && cx <= canvas.width - minionRadius - 12
            && cy >= minionRadius + 12 && cy <= canvas.height - minionRadius - 12;
          if (!insideArena) continue;
          const clearOfOthers = zombies.every((z) =>
            Math.hypot(cx - z.x, cy - z.y) > minionRadius + z.radius + 6
          );
          const clearOfPlayer = Math.hypot(cx - player.x, cy - player.y) > minionRadius + player.radius + 6;
          if (clearOfOthers && clearOfPlayer) {
            const minion = makeZombie('witch_minion', spawnSequence, zombies);
            minion.x = cx;
            minion.y = cy;
            minion.spawnShieldUntil = now + 500;
            minion.riseUntil = now + 500;
            spawnSequence += 1;
            zombies.push(minion);
            // Summon patch effect
            summonEffects.push({
              x: cx,
              y: cy,
              spawnTime: now,
              life: 2000,
            });
            zombie.witchSummonsLeft -= 1;
            spawned = true;
            break;
          }
        }
        if (!spawned) {
          // No space - just decrement attempts without spawning
          zombie.witchSummonsLeft -= 1;
        }
      }

      if (now >= zombie.witchChannelUntil) {
        zombie.witchPhase = 'cooldown';
        zombie.witchNextCooldownEnd = now + 6000;
        zombie.witchWandAngle = -Math.PI / 2;
      }
    } else if (zombie.witchPhase === 'cooldown') {
      if (now >= zombie.witchNextCooldownEnd) {
        zombie.witchPhase = 'moving';
        zombie.witchMoveUntil = now + 3000;
      }
      // Slowly drift toward player during cooldown
      const dx = player.x - zombie.x;
      const dy = player.y - zombie.y;
      const dist = Math.hypot(dx, dy) || 1;
      const attackRange = player.radius + zombie.radius + 5;
      if (dist > attackRange) {
        const move = Math.min(zombie.speed * 0.3 * delta, dist - attackRange);
        zombie.x += (dx / dist) * move;
        zombie.y += (dy / dist) * move;
      }
    }

    keepInsideArena(zombie);
  }

  // Update summon effects
  for (let i = summonEffects.length - 1; i >= 0; i--) {
    if (now - summonEffects[i].spawnTime >= summonEffects[i].life) {
      summonEffects.splice(i, 1);
    }
  }
}

function updateZombies(delta) {
  const now = performance.now();
  for (const zombie of zombies) {
    if (zombie.type === 'witch' || zombie.type === 'witch_minion') continue; // handled in updateWitches
    const dx = player.x - zombie.x;
    const dy = player.y - zombie.y;
    const distance = Math.hypot(dx, dy) || 1;
    if (zombie.type === 'skeleton') {
      const preferredRange = 8 * 40;
      if (distance > preferredRange) {
        const movement = Math.min(zombie.speed * delta, distance - preferredRange);
        zombie.x += (dx / distance) * movement;
        zombie.y += (dy / distance) * movement;
      }
      continue;
    }
    if (zombie.type === 'knight_boss') {
      const isAttacking = now < zombie.attackStartTime + 1600;
      if (isAttacking) {
        // Stops moving during 1.2s draw back and swing
        continue;
      }
    }
    if (zombie.type === 'jester_boss') {
      const isSlam = zombie.jesterHandPhase === 'windup' || zombie.jesterHandPhase === 'slam';
      if (isSlam) continue;
    }
    const attackRange = player.radius + zombie.radius + 5;
    if (distance > attackRange) {
      const movement = Math.min(zombie.speed * delta, distance - attackRange);
      zombie.x += (dx / distance) * movement;
      zombie.y += (dy / distance) * movement;
      if (zombie.type === 'tank' && now >= (zombie.nextStompFxAt || 0)) {
        zombie.nextStompFxAt = now + 420;
        visualEffects.push({ type: 'dust', x: zombie.x, y: zombie.y + zombie.radius * 0.65, spawnTime: now, life: 420, color: '#bda47f' });
      }
    }
  }

  // witch_minion movement
  for (const zombie of zombies) {
    if (zombie.type !== 'witch_minion') continue;
    const dx = player.x - zombie.x;
    const dy = player.y - zombie.y;
    const distance = Math.hypot(dx, dy) || 1;
    const attackRange = player.radius + zombie.radius + 5;
    if (distance > attackRange) {
      const movement = Math.min(zombie.speed * delta, distance - attackRange);
      zombie.x += (dx / distance) * movement;
      zombie.y += (dy / distance) * movement;
    }
  }

  resolveHitboxes();

  for (const zombie of zombies) {
    const distance = Math.hypot(player.x - zombie.x, player.y - zombie.y);
    if (zombie.type === 'witch' || zombie.type === 'witch_minion') {
      // witch_minions attack player on contact
      if (zombie.type === 'witch_minion') {
        const attackRange = player.radius + zombie.radius + 8;
        if (distance <= attackRange && now >= zombie.nextAttackTime) {
          const died = damagePlayer(1);
          zombie.nextAttackTime = now + 2000;
          zombie.attackUntil = now + 260;
          if (died) return;
        }
      }
      continue;
    }
    if (zombie.type === 'skeleton') {
      if (now >= zombie.nextArrowTime) {
        shootArrow(zombie);
        zombie.nextArrowTime = now + 3000;
        zombie.bowUntil = now + 260;
      }
      continue;
    }
    if (zombie.type === 'knight_boss') {
      if (distance <= 120 && now >= zombie.nextAttackTime) {
        zombie.attackStartTime = now;
        zombie.swingDamaged = false;
        zombie.nextAttackTime = now + 4600; // 1.6s attack + 3s recharge
      }
      // 1.2s delay before swing damage applies
      const elapsed = now - zombie.attackStartTime;
      if (elapsed >= 1200 && elapsed < 1600 && !zombie.swingDamaged) {
        if (distance <= 125) {
          zombie.swingDamaged = true;
          damagePlayer(2);
        }
      }
      continue;
    }
    if (zombie.type === 'jester_boss') {
      if (zombie.jesterHandPhase === 'orbit' && now >= zombie.jesterNextSlamAt) {
        zombie.jesterHandPhase = 'windup';
        zombie.jesterSlamStart = now;
        zombie.jesterSlamDamaged = false;
        zombie.jesterNextSlamAt = now + 5200;
      }

      const slamElapsed = now - zombie.jesterSlamStart;
      if (zombie.jesterHandPhase === 'windup' && slamElapsed >= 700) {
        zombie.jesterHandPhase = 'slam';
      }
      if (zombie.jesterHandPhase === 'slam' && slamElapsed >= 850 && !zombie.jesterSlamDamaged) {
        zombie.jesterSlamDamaged = true;
        visualEffects.push({ type: 'slam', x: zombie.x, y: zombie.y, spawnTime: now, life: 520, color: '#ffd85a' });
        if (distance <= 155) {
          const died = damagePlayer(2);
          if (died) return;
        }
      }
      if (zombie.jesterHandPhase === 'slam' && slamElapsed >= 1250) {
        zombie.jesterHandPhase = 'orbit';
      }
      continue;
    }
    const attackRange = player.radius + zombie.radius + 8;
    if (distance <= attackRange && now >= zombie.nextAttackTime) {
      const died = damagePlayer(1);
      zombie.nextAttackTime = now + 2000;
      zombie.attackUntil = now + 260;
      if (died) return;
    }
  }
}

function update(delta) {
  updatePlayer(delta);
  survivalTime += delta;
  animationTime += delta;

  if (betweenWaves) {
    if (performance.now() >= nextWaveTime) startWave();
    return;
  }

  if (performance.now() >= roundEndsAt && !isBossWave()) {
    skipCurrentRound();
    return;
  }

  spawnNextEnemy();
  spawnNextSkeleton();
  spawnNextWitch();
  shootNearestZombie();
  updateShots(delta);
  updateWitches(delta);
  updateZombies(delta);
  updateJesterBlades(delta);
  updateEnemyArrows(delta);
  updateDroppedItems(delta);
  updateDrones(delta);
  updateLaserRings();
  const now = performance.now();
  visualEffects = visualEffects.filter((effect) => now - effect.spawnTime < effect.life);
  shellCasings = shellCasings.filter((shell) => now - shell.spawnTime < shell.life);

  const remaining = zombies.length;
  if (remaining === 0 && !hasPendingWaveEnemies() && skeletonSpawnQueue.length === 0 && witchSpawnQueue.length === 0) {
    clearProjectiles();
    if (round >= maxRounds) {
      won = true;
      message.textContent = `You survived all ${maxRounds} rounds in ${survivalTime.toFixed(1)} seconds!`;
      restartButton.hidden = false;
    } else {
      round += 1;
      betweenWaves = true;
      nextWaveTime = performance.now() + 1500;
      message.textContent = `Round cleared! Round ${round} starts in 1.5 seconds.`;
    }
  } else if (alive) {
    message.textContent = `Round ${round}/${maxRounds} - active: ${remaining}`;
  }
}

function drawGrid() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = '#324044';
  ctx.lineWidth = 1;
  for (let x = 0; x <= canvas.width; x += 40) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, canvas.height); ctx.stroke(); }
  for (let y = 0; y <= canvas.height; y += 40) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(canvas.width, y); ctx.stroke(); }
}

function drawHealthBar(centerX, topY, width, height, current, maximum, color) {
  const leftX = centerX - width / 2;
  ctx.fillStyle = '#171717';
  ctx.fillRect(leftX - 1, topY - 1, width + 2, height + 2);
  ctx.fillStyle = color;
  ctx.fillRect(leftX, topY, width * (current / maximum), height);
}

function drawVisualEffects() {
  const now = performance.now();
  for (const effect of visualEffects) {
    const progress = Math.min((now - effect.spawnTime) / effect.life, 1);
    ctx.save();
    ctx.globalAlpha = 1 - progress;
    ctx.strokeStyle = effect.color;
    ctx.fillStyle = effect.color;
    ctx.shadowColor = effect.color;
    ctx.shadowBlur = 12;
    if (effect.type === 'shockwave' || effect.type === 'slam') {
      ctx.lineWidth = effect.type === 'slam' ? 5 : 3;
      ctx.beginPath();
      ctx.arc(effect.x, effect.y, 16 + progress * (effect.type === 'slam' ? 150 : 62), 0, Math.PI * 2);
      ctx.stroke();
      if (effect.type === 'slam') {
        for (let i = 0; i < 8; i++) {
          const angle = i * Math.PI / 4 + 0.18;
          ctx.beginPath();
          ctx.moveTo(effect.x + Math.cos(angle) * 30, effect.y + Math.sin(angle) * 30);
          ctx.lineTo(effect.x + Math.cos(angle) * (65 + progress * 70), effect.y + Math.sin(angle) * (65 + progress * 70));
          ctx.stroke();
        }
      }
    } else if (effect.type === 'sparks' || effect.type === 'shatter') {
      const count = effect.type === 'shatter' ? 9 : 6;
      for (let i = 0; i < count; i++) {
        const angle = i * Math.PI * 2 / count + 0.2;
        const distance = 8 + progress * (effect.type === 'shatter' ? 55 : 28);
        ctx.beginPath();
        ctx.moveTo(effect.x + Math.cos(angle) * distance * 0.35, effect.y + Math.sin(angle) * distance * 0.35);
        ctx.lineTo(effect.x + Math.cos(angle) * distance, effect.y + Math.sin(angle) * distance);
        ctx.lineWidth = effect.type === 'shatter' ? 4 : 2;
        ctx.stroke();
      }
    } else if (effect.type === 'dust') {
      ctx.globalAlpha *= 0.45;
      ctx.beginPath();
      ctx.ellipse(effect.x, effect.y, 12 + progress * 34, 5 + progress * 12, 0, 0, Math.PI * 2);
      ctx.fill();
    } else if (effect.type === 'death') {
      ctx.globalAlpha *= 0.48;
      for (let i = 0; i < 14; i++) {
        const angle = i * 2.399 + effect.radius;
        const distance = 5 + progress * (effect.radius + 32) * (0.55 + (i % 3) * 0.16);
        const size = Math.max(1.5, (1 - progress) * (4 + (i % 3)));
        ctx.beginPath();
        ctx.arc(effect.x + Math.cos(angle) * distance, effect.y - progress * 24 + Math.sin(angle) * distance, size, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
  }
  for (const shell of shellCasings) {
    const progress = Math.min((now - shell.spawnTime) / shell.life, 1);
    ctx.save();
    ctx.translate(shell.x + Math.cos(shell.angle) * progress * 42, shell.y + Math.sin(shell.angle) * progress * 24 + progress * progress * 24);
    ctx.rotate(progress * 14);
    ctx.globalAlpha = 1 - progress;
    ctx.fillStyle = '#e6b64a';
    ctx.fillRect(-5, -2, 10, 4);
    ctx.restore();
  }
}

function drawDroppedItems() {
  const now = performance.now();
  for (const item of droppedItems) {
    const bounce = Math.sin((now - item.spawnTime) * 0.007) * 6;
    ctx.save();
    ctx.translate(item.x, item.y + bounce);
    ctx.shadowBlur = 14;
    if (item.type === 'shotgun' && shotgunIcon.complete && shotgunIcon.naturalWidth > 0) {
      ctx.shadowColor = '#ffcc00';
      ctx.drawImage(shotgunIcon, -23, -5, 46, 10);
    } else if (item.type === 'drone_pack' && droneIcon.complete && droneIcon.naturalWidth > 0) {
      ctx.shadowColor = '#00ffff';
      ctx.drawImage(droneIcon, -20, -13, 40, 26);
    } else if (item.type === 'turret') {
      ctx.shadowColor = '#ffcf54';
      ctx.fillStyle = '#677583';
      ctx.fillRect(-14, -8, 28, 16);
      ctx.fillStyle = '#2d3540';
      ctx.beginPath(); ctx.arc(-9, 10, 7, 0, Math.PI * 2); ctx.arc(9, 10, 7, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#8b9baa'; ctx.fillRect(-3, -17, 6, 14);
    } else if (item.type === 'laser_rings') {
      ctx.strokeStyle = '#7ee8ff'; ctx.shadowColor = '#aa75ff'; ctx.shadowBlur = 16; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.arc(0, 0, 17, 0, Math.PI * 2); ctx.stroke();
      ctx.strokeStyle = '#d5a7ff'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(0, 0, 12, 0, Math.PI * 2); ctx.stroke();
    } else if (item.type === 'heart') {
      ctx.shadowColor = '#ff0044';
      if (heartIcon.complete && heartIcon.naturalWidth > 0) {
        ctx.drawImage(heartIcon, -16, -16, 32, 32);
      } else {
        ctx.fillStyle = '#ff2244';
        ctx.beginPath();
        ctx.arc(0, 0, 14, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
  }
}

function drawPlayer() {
  let aimAngle = player.moveAngle;
  if (zombies.length > 0) {
    let nearest = zombies[0];
    let nearestDist = Infinity;
    for (const z of zombies) {
      const d = Math.hypot(z.x - player.x, z.y - player.y);
      if (d < nearestDist) {
        nearestDist = d;
        nearest = z;
      }
    }
    aimAngle = Math.atan2(nearest.y - player.y, nearest.x - player.x);
  }

  const now = performance.now();
  const bob = player.isMoving ? Math.sin(player.walkTime * 15) * 3 : 0;
  const recoil = now < playerRecoilUntil ? -7 * (1 - (playerRecoilUntil - now) / 120) : 0;
  if (hasShotgun && shotgunIcon.complete && shotgunIcon.naturalWidth > 0) {
    ctx.save();
    ctx.translate(player.x + Math.cos(aimAngle) * recoil, player.y + bob + Math.sin(aimAngle) * recoil);
    ctx.rotate(aimAngle);
    ctx.drawImage(shotgunIcon, 8, -6, 40, 9);
    if (now < playerShotFlashUntil) {
      ctx.fillStyle = '#fff0a0';
      ctx.shadowColor = '#ff9d2e';
      ctx.shadowBlur = 14;
      ctx.beginPath();
      ctx.moveTo(49, 0); ctx.lineTo(61, -7); ctx.lineTo(58, 0); ctx.lineTo(61, 7); ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }

  ctx.save();
  ctx.translate(player.x, player.y + bob);
  ctx.fillStyle = '#4ba3ff';
  ctx.beginPath();
  ctx.arc(0, 0, player.radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  if (now < playerShotFlashUntil && !hasShotgun) {
    ctx.save();
    ctx.translate(player.x + Math.cos(aimAngle) * 24, player.y + bob + Math.sin(aimAngle) * 24);
    ctx.fillStyle = '#fff2a6'; ctx.shadowColor = '#ff852c'; ctx.shadowBlur = 14;
    ctx.beginPath(); ctx.arc(0, 0, 7, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 14px Arial';
  ctx.textAlign = 'center';
  ctx.fillText('YOU', player.x, player.y + bob - player.radius - 22);
  drawHealthBar(player.x, player.y + bob - player.radius - 16, 46, 6, playerHealth, playerMaxHealth, '#ff4545');
}

function drawKnightBoss(zombie) {
  const now = performance.now();
  const facingAngle = Math.atan2(player.y - zombie.y, player.x - zombie.x);

  // 1. Sword Stance & Animated Swing (1.2s draw-back to left, then fast swing to right)
  let swordAngle = facingAngle + 0.4;
  if (now >= zombie.attackStartTime && now < zombie.attackStartTime + 1600) {
    const elapsed = now - zombie.attackStartTime;
    if (elapsed < 1200) {
      // 1.2s delay: Draws sword to the left
      swordAngle = facingAngle - 1.5;
    } else {
      // 0.4s fast swing from left (-1.5 rad) to right (+1.5 rad)
      const progress = (elapsed - 1200) / 400;
      swordAngle = facingAngle - 1.5 + progress * 3.0;
    }
  }

  const attackElapsed = now - zombie.attackStartTime;
  if (attackElapsed >= 1100 && attackElapsed < 1620) {
    const slashProgress = Math.max(0, (attackElapsed - 1100) / 520);
    ctx.save();
    ctx.translate(zombie.x, zombie.y);
    ctx.rotate(facingAngle - 1.5 + slashProgress * 3);
    ctx.globalAlpha = 0.55 * (1 - slashProgress);
    ctx.strokeStyle = '#ffb13d';
    ctx.shadowColor = '#ff6b27';
    ctx.shadowBlur = 16;
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.arc(0, 0, 72, -1.3, 0.5);
    ctx.stroke();
    ctx.restore();
  }

  // Draw Sword
  if (bossSwordIcon.complete && bossSwordIcon.naturalWidth > 0) {
    ctx.save();
    ctx.translate(zombie.x, zombie.y);
    ctx.rotate(swordAngle);
    ctx.shadowColor = '#ff6600';
    ctx.shadowBlur = 12;
    const swordW = 24;
    const swordH = 190;
    ctx.drawImage(bossSwordIcon, 10, -swordH + 15, swordW, swordH);
    ctx.restore();
  }

  // 2. Knight Body (Kept straight / static orientation, does not turn when facing enemy)
  if (bossKnightIcon.complete && bossKnightIcon.naturalWidth > 0) {
    ctx.save();
    ctx.translate(zombie.x, zombie.y);
    ctx.beginPath();
    ctx.arc(0, 0, zombie.radius * 0.96, 0, Math.PI * 2);
    ctx.clip();
    ctx.drawImage(bossKnightIcon, -zombie.radius, -zombie.radius, zombie.radius * 2, zombie.radius * 2);
    ctx.restore();
  } else {
    ctx.fillStyle = '#41382f';
    ctx.beginPath();
    ctx.arc(zombie.x, zombie.y, zombie.radius, 0, Math.PI * 2);
    ctx.fill();
  }

  // 3. Label & Health bar
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 13px Arial';
  ctx.textAlign = 'center';
  ctx.fillText('BOSS', zombie.x, zombie.y - zombie.radius - 20);
  drawHealthBar(zombie.x, zombie.y - zombie.radius - 14, 75, 7, zombie.maxHits - zombie.hits, zombie.maxHits, now < zombie.hitFlashUntil ? '#ffffff' : '#ff9900');
}

function drawZombieArms(zombie, facingAngle) {
  const colors = zombie.type === 'speedy'
    ? { outer: '#164762', inner: '#3b89af', texture: '#0d334a' }
    : zombie.type === 'big'
      ? { outer: '#5e2025', inner: '#a44042', texture: '#3a1519' }
      : { outer: '#344d2c', inner: '#5d813f', texture: '#22351e' };
  const sideAngle = facingAngle + Math.PI / 2;
  const attacking = performance.now() < zombie.attackUntil;
  const armSwing = attacking
    ? Math.sin(animationTime * 28 + zombie.phase) * 0.3
    : Math.sin(animationTime * 3.5 + zombie.phase) * 0.045;
  const outerWidth = zombie.type === 'big' ? 12 : 9;
  ctx.lineCap = 'round';

  for (const side of [-1, 1]) {
    const shoulderX = zombie.x + Math.cos(facingAngle) * zombie.radius * 0.12 + Math.cos(sideAngle) * zombie.radius * 0.46 * side;
    const shoulderY = zombie.y + Math.sin(facingAngle) * zombie.radius * 0.12 + Math.sin(sideAngle) * zombie.radius * 0.46 * side;
    const elbowAngle = facingAngle + side * 0.5 + armSwing;
    const elbowX = shoulderX + Math.cos(elbowAngle) * zombie.radius * 0.55;
    const elbowY = shoulderY + Math.sin(elbowAngle) * zombie.radius * 0.55;
    const handAngle = facingAngle + side * 0.16 + armSwing;
    const handX = elbowX + Math.cos(handAngle) * zombie.radius * 0.6;
    const handY = elbowY + Math.sin(handAngle) * zombie.radius * 0.6;

    ctx.strokeStyle = colors.outer;
    ctx.lineWidth = outerWidth;
    ctx.beginPath();
    ctx.moveTo(shoulderX, shoulderY);
    ctx.lineTo(elbowX, elbowY);
    ctx.lineTo(handX, handY);
    ctx.stroke();

    ctx.strokeStyle = colors.inner;
    ctx.lineWidth = outerWidth * 0.46;
    ctx.beginPath();
    ctx.moveTo(shoulderX, shoulderY);
    ctx.lineTo(elbowX, elbowY);
    ctx.lineTo(handX, handY);
    ctx.stroke();

    ctx.strokeStyle = colors.outer;
    ctx.lineWidth = 2;
    for (const finger of [-0.22, 0.22]) {
      ctx.beginPath();
      ctx.moveTo(handX, handY);
      ctx.lineTo(handX + Math.cos(handAngle + finger) * 6, handY + Math.sin(handAngle + finger) * 6);
      ctx.stroke();
    }

    // A thin wavy texture line makes the simple arm read more like zombie skin.
    ctx.strokeStyle = colors.texture;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    for (let step = 0; step <= 4; step++) {
      const progress = step / 4;
      const baseX = shoulderX + (handX - shoulderX) * progress;
      const baseY = shoulderY + (handY - shoulderY) * progress;
      const wiggle = step === 0 || step === 4 ? 0 : (step % 2 === 0 ? 2 : -2);
      const pointX = baseX + Math.cos(handAngle + Math.PI / 2) * wiggle;
      const pointY = baseY + Math.sin(handAngle + Math.PI / 2) * wiggle;
      if (step === 0) ctx.moveTo(pointX, pointY);
      else ctx.lineTo(pointX, pointY);
    }
    ctx.stroke();
  }
}

function drawSkeleton(skeleton) {
  const facingAngle = Math.atan2(player.y - skeleton.y, player.x - skeleton.x);
  const sideAngle = facingAngle + Math.PI / 2;
  const bowSize = skeleton.radius * 1.55;
  const bowOffset = skeleton.radius * 0.42;

  if (skeletonIcon.complete && skeletonIcon.naturalWidth > 0) {
    ctx.save();
    ctx.translate(skeleton.x, skeleton.y);
    ctx.rotate(facingAngle + Math.PI / 2);
    ctx.beginPath();
    ctx.arc(0, 0, skeleton.radius * 0.94, 0, Math.PI * 2);
    ctx.clip();
    ctx.drawImage(skeletonIcon, 365, 90, 310, 390, -skeleton.radius, -skeleton.radius, skeleton.radius * 2, skeleton.radius * 2);
    ctx.restore();
  } else {
    ctx.fillStyle = '#dfdac7';
    ctx.beginPath();
    ctx.arc(skeleton.x, skeleton.y, skeleton.radius, 0, Math.PI * 2);
    ctx.fill();
  }

  if (bowIcon.complete && bowIcon.naturalWidth > 0) {
    const bowX = skeleton.x - Math.cos(sideAngle) * bowOffset;
    const bowY = skeleton.y - Math.sin(sideAngle) * bowOffset;
    ctx.save();
    ctx.translate(bowX, bowY);
    ctx.rotate(facingAngle);
    const drawProgress = Math.max(0, Math.min(1, (skeleton.bowUntil - performance.now()) / 260));
    ctx.scale(1, 1 + drawProgress * 0.22);
    ctx.drawImage(bowIcon, -bowSize * 0.5, -bowSize * 0.5, bowSize, bowSize);
    if (drawProgress > 0) {
      ctx.strokeStyle = '#fff1bf';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(-bowSize * 0.35, 0); ctx.lineTo(-bowSize * 0.72, 0); ctx.stroke();
    }
    ctx.restore();
  }

  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 12px Arial';
  ctx.textAlign = 'center';
  ctx.fillText('SKELETON', skeleton.x, skeleton.y - skeleton.radius - 18);
  drawHealthBar(skeleton.x, skeleton.y - skeleton.radius - 13, skeleton.radius * 1.65, 5, skeleton.maxHits - skeleton.hits, skeleton.maxHits, performance.now() < skeleton.hitFlashUntil ? '#ffffff' : '#e9e2cc');
}

function drawWitch(zombie) {
  const facingAngle = Math.atan2(player.y - zombie.y, player.x - zombie.x);

  // Draw wand (held up during channeling)
  if (wandIcon.complete && wandIcon.naturalWidth > 0) {
    ctx.save();
    ctx.translate(zombie.x, zombie.y);
    ctx.rotate(zombie.witchWandAngle !== undefined ? zombie.witchWandAngle : facingAngle - 0.4);
    // Wand glow during channeling
    if (zombie.witchPhase === 'channeling') {
      ctx.shadowColor = '#bb44ff';
      const charge = Math.min((performance.now() - zombie.witchChannelStart) / 3000, 1);
      ctx.shadowBlur = 18 + charge * 28 + Math.sin(animationTime * 8) * 8;
    } else {
      ctx.shadowColor = '#7733cc';
      ctx.shadowBlur = 6;
    }
    ctx.drawImage(wandIcon, -6, -50, 18, 55);
    ctx.restore();
  }

  // Draw witch body
  if (witchIcon.complete && witchIcon.naturalWidth > 0) {
    ctx.save();
    ctx.translate(zombie.x, zombie.y);
    ctx.beginPath();
    ctx.arc(0, 0, zombie.radius * 0.95, 0, Math.PI * 2);
    ctx.clip();
    ctx.drawImage(witchIcon, -zombie.radius, -zombie.radius, zombie.radius * 2, zombie.radius * 2);
    ctx.restore();
  } else {
    ctx.fillStyle = '#7b2fa0';
    ctx.beginPath();
    ctx.arc(zombie.x, zombie.y, zombie.radius, 0, Math.PI * 2);
    ctx.fill();
  }

  // Phase indicator ring
  if (zombie.witchPhase === 'channeling') {
    ctx.save();
    ctx.strokeStyle = '#dd55ff';
    ctx.lineWidth = 2.5;
    ctx.shadowColor = '#cc00ff';
    ctx.shadowBlur = 12;
    ctx.globalAlpha = 0.7 + Math.sin(animationTime * 10) * 0.3;
    ctx.beginPath();
    ctx.arc(zombie.x, zombie.y, zombie.radius + 8, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  ctx.fillStyle = '#ffddff';
  ctx.font = 'bold 12px Arial';
  ctx.textAlign = 'center';
  ctx.fillText('WITCH', zombie.x, zombie.y - zombie.radius - 18);
  drawHealthBar(zombie.x, zombie.y - zombie.radius - 13, zombie.radius * 1.65, 5, zombie.maxHits - zombie.hits, zombie.maxHits, performance.now() < zombie.hitFlashUntil ? '#ffffff' : '#cc44ff');
}

function drawWitchMinion(zombie) {
  const facingAngle = Math.atan2(player.y - zombie.y, player.x - zombie.x);

  if (witchMinionIcon.complete && witchMinionIcon.naturalWidth > 0) {
    ctx.save();
    const rise = zombie.riseUntil ? Math.max(0, (zombie.riseUntil - performance.now()) / 500) : 0;
    ctx.translate(zombie.x, zombie.y + rise * 35);
    ctx.scale(1 - rise * 0.25, 1 - rise * 0.25);
    ctx.rotate(facingAngle + Math.PI / 2);
    ctx.beginPath();
    ctx.arc(0, 0, zombie.radius * 0.94, 0, Math.PI * 2);
    ctx.clip();
    ctx.drawImage(witchMinionIcon, -zombie.radius, -zombie.radius, zombie.radius * 2, zombie.radius * 2);
    ctx.restore();
  } else {
    ctx.fillStyle = '#8a8a8a';
    ctx.beginPath();
    ctx.arc(zombie.x, zombie.y, zombie.radius, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.fillStyle = '#cccccc';
  ctx.font = 'bold 10px Arial';
  ctx.textAlign = 'center';
  ctx.fillText('MINION', zombie.x, zombie.y - zombie.radius - 16);
  drawHealthBar(zombie.x, zombie.y - zombie.radius - 11, zombie.radius * 1.65, 4, zombie.maxHits - zombie.hits, zombie.maxHits, performance.now() < zombie.hitFlashUntil ? '#ffffff' : '#aaaaaa');
}

function drawSummonEffects() {
  const now = performance.now();
  for (const fx of summonEffects) {
    const elapsed = now - fx.spawnTime;
    const lifeRatio = elapsed / fx.life; // 0 to 1
    // Fade out first 1s, fade in for next 1s (repeating pulsing appearance)
    // 0-0.25: fade in, 0.25-0.75: full, 0.75-1: fade out
    let alpha;
    if (lifeRatio < 0.25) alpha = lifeRatio / 0.25;
    else if (lifeRatio < 0.75) alpha = 1;
    else alpha = 1 - (lifeRatio - 0.75) / 0.25;

    ctx.save();
    ctx.globalAlpha = Math.max(0, alpha) * 0.85;
    ctx.translate(fx.x, fx.y);
    const expansion = Math.min(elapsed / 500, 1);
    const size = (18 + expansion * 56) + Math.sin(elapsed * 0.006) * 6;
    if (summonPatchIcon.complete && summonPatchIcon.naturalWidth > 0) {
      ctx.drawImage(summonPatchIcon, -size / 2, -size / 2, size, size);
    } else {
      ctx.fillStyle = '#aa22ff';
      ctx.beginPath();
      ctx.ellipse(0, 0, size / 2, size / 4, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
}

function drawJesterHand(zombie, side, facingAngle, now) {
  const slamElapsed = now - zombie.jesterSlamStart;
  const orbit = animationTime * 2.4 + zombie.jesterHandAngle + side * 1.8;
  let reach = zombie.radius * 1.34;
  let handAngle = facingAngle + side * 1.1 + Math.sin(orbit) * 0.42;
  if (zombie.jesterHandPhase === 'windup') {
    const pull = Math.min(slamElapsed / 700, 1);
    reach += 32 * pull;
    handAngle = facingAngle + Math.PI + side * 0.45;
  } else if (zombie.jesterHandPhase === 'slam') {
    const strike = Math.min(Math.max((slamElapsed - 700) / 240, 0), 1);
    reach += 34 + 52 * strike;
    handAngle = facingAngle + side * (0.18 - 0.18 * strike);
  }
  if (zombie.jesterBladePhase === 'charging') {
    reach += 28;
    handAngle = -Math.PI / 2 + side * 0.5;
  }

  const shoulderX = zombie.x + Math.cos(facingAngle + side * 0.88) * zombie.radius * 0.34;
  const shoulderY = zombie.y + Math.sin(facingAngle + side * 0.88) * zombie.radius * 0.34;
  const elbowX = shoulderX + Math.cos(handAngle + side * 0.38) * reach * 0.46;
  const elbowY = shoulderY + Math.sin(handAngle + side * 0.38) * reach * 0.46;
  const palmX = elbowX + Math.cos(handAngle - side * 0.24) * reach * 0.54;
  const palmY = elbowY + Math.sin(handAngle - side * 0.24) * reach * 0.54;

  ctx.save();
  ctx.lineCap = 'round';
  // A striped, jointed sleeve makes the arms feel like a puppeteer's limbs instead of zombie arms.
  ctx.strokeStyle = '#351546';
  ctx.lineWidth = 19;
  ctx.beginPath();
  ctx.moveTo(shoulderX, shoulderY);
  ctx.quadraticCurveTo(elbowX, elbowY, palmX, palmY);
  ctx.stroke();
  ctx.strokeStyle = '#d23d83';
  ctx.lineWidth = 12;
  ctx.beginPath();
  ctx.moveTo(shoulderX, shoulderY);
  ctx.quadraticCurveTo(elbowX, elbowY, palmX, palmY);
  ctx.stroke();
  ctx.strokeStyle = '#ffd84c';
  ctx.lineWidth = 4;
  for (const t of [0.28, 0.64]) {
    const x = shoulderX + (palmX - shoulderX) * t;
    const y = shoulderY + (palmY - shoulderY) * t;
    ctx.beginPath();
    ctx.arc(x, y, 7, 0, Math.PI * 2);
    ctx.stroke();
  }

  // Oversized gloved palm with five individually splayed, animated fingers.
  ctx.fillStyle = '#f5e6cf';
  ctx.strokeStyle = '#3b163e';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(palmX, palmY, 14, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  const fingerFan = zombie.jesterHandPhase === 'slam' ? 0.9 : 0.58;
  for (let finger = -2; finger <= 2; finger++) {
    const fingerAngle = handAngle + finger * fingerFan * 0.27 + Math.sin(orbit * 1.6 + finger) * 0.09;
    const fingerLength = finger === -2 || finger === 2 ? 15 : 19;
    const knuckleX = palmX + Math.cos(fingerAngle) * 10;
    const knuckleY = palmY + Math.sin(fingerAngle) * 10;
    const tipX = knuckleX + Math.cos(fingerAngle + side * 0.12) * fingerLength;
    const tipY = knuckleY + Math.sin(fingerAngle + side * 0.12) * fingerLength;
    ctx.strokeStyle = '#3b163e';
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.moveTo(palmX, palmY);
    ctx.lineTo(knuckleX, knuckleY);
    ctx.lineTo(tipX, tipY);
    ctx.stroke();
    ctx.strokeStyle = '#f5e6cf';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(palmX, palmY);
    ctx.lineTo(knuckleX, knuckleY);
    ctx.lineTo(tipX, tipY);
    ctx.stroke();
  }
  ctx.restore();
}

function drawJesterBoss(zombie) {
  const now = performance.now();
  const facingAngle = Math.atan2(player.y - zombie.y, player.x - zombie.x);
  drawJesterHand(zombie, -1, facingAngle, now);
  drawJesterHand(zombie, 1, facingAngle, now);

  if (zombie.jesterBladePhase === 'charging') {
    const charge = Math.min((now - zombie.jesterBladeStart) / 2000, 1);
    ctx.save();
    ctx.globalAlpha = 0.25 + charge * 0.45;
    ctx.strokeStyle = '#f06cff'; ctx.shadowColor = '#f06cff'; ctx.shadowBlur = 22; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(zombie.x, zombie.y, zombie.radius + 14 + Math.sin(animationTime * 12) * 5, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
  }

  if (jesterBossIcon.complete && jesterBossIcon.naturalWidth > 0) {
    ctx.save();
    ctx.translate(zombie.x, zombie.y);
    ctx.rotate(facingAngle + Math.PI / 2);
    ctx.beginPath();
    ctx.arc(0, 0, zombie.radius * 0.96, 0, Math.PI * 2);
    ctx.clip();
    ctx.drawImage(jesterBossIcon, -zombie.radius, -zombie.radius, zombie.radius * 2, zombie.radius * 2);
    ctx.restore();
  }

  ctx.fillStyle = '#fff0a8';
  ctx.font = 'bold 14px Arial';
  ctx.textAlign = 'center';
  ctx.fillText('JESTER BOSS', zombie.x, zombie.y - zombie.radius - 23);
  drawHealthBar(zombie.x, zombie.y - zombie.radius - 16, 92, 8, zombie.maxHits - zombie.hits, zombie.maxHits, performance.now() < zombie.hitFlashUntil ? '#ffffff' : '#e43c92');
}

function drawTank(zombie) {
  const facingAngle = Math.atan2(player.y - zombie.y, player.x - zombie.x);
  const bob = Math.sin(animationTime * 3 + zombie.phase) * 2;
  if (tankZombieIcon.complete && tankZombieIcon.naturalWidth > 0) {
    ctx.save();
    ctx.translate(zombie.x, zombie.y + bob);
    ctx.beginPath();
    ctx.arc(0, 0, zombie.radius * 0.96, 0, Math.PI * 2);
    ctx.clip();
    ctx.drawImage(tankZombieIcon, -zombie.radius, -zombie.radius, zombie.radius * 2, zombie.radius * 2);
    ctx.restore();
  }

  if (zombie.shieldHits < zombie.maxShieldHits) {
    const shieldX = zombie.x + Math.cos(facingAngle) * zombie.radius * 0.66;
    const shieldY = zombie.y + Math.sin(facingAngle) * zombie.radius * 0.66 + bob;
    ctx.save();
    const recoil = Math.max(0, (zombie.shieldRecoilUntil - performance.now()) / 180) * 12;
    ctx.translate(shieldX - Math.cos(facingAngle) * recoil, shieldY - Math.sin(facingAngle) * recoil);
    ctx.rotate(Math.sin(animationTime * 4 + zombie.phase) * 0.05);
    ctx.shadowColor = performance.now() < zombie.shieldFlashUntil ? '#7fe9ff' : '#95a9c6';
    ctx.shadowBlur = performance.now() < zombie.shieldFlashUntil ? 24 : 9;
    if (tankShieldIcon.complete && tankShieldIcon.naturalWidth > 0) {
      ctx.drawImage(tankShieldIcon, -31, -37, 62, 74);
    }
    ctx.restore();
  }

  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 13px Arial';
  ctx.textAlign = 'center';
  ctx.fillText('TANK', zombie.x, zombie.y - zombie.radius - 20);
  drawHealthBar(zombie.x, zombie.y - zombie.radius - 14, 82, 7, zombie.maxHits - zombie.hits, zombie.maxHits, performance.now() < zombie.hitFlashUntil ? '#ffffff' : '#c7604c');
  if (zombie.shieldHits < zombie.maxShieldHits) {
    drawHealthBar(zombie.x, zombie.y - zombie.radius - 5, 82, 4, zombie.maxShieldHits - zombie.shieldHits, zombie.maxShieldHits, '#8ec9ff');
  }
}

function drawZombie(zombie) {
  if (zombie.type === 'tank') {
    drawTank(zombie);
    return;
  }
  if (zombie.type === 'jester_boss') {
    drawJesterBoss(zombie);
    return;
  }
  if (zombie.type === 'knight_boss') {
    drawKnightBoss(zombie);
    return;
  }
  if (zombie.type === 'skeleton') {
    drawSkeleton(zombie);
    return;
  }
  if (zombie.type === 'witch') {
    drawWitch(zombie);
    return;
  }
  if (zombie.type === 'witch_minion') {
    drawWitchMinion(zombie);
    return;
  }
  const facingAngle = Math.atan2(player.y - zombie.y, player.x - zombie.x);
  const sprite = zombie.type === 'speedy' ? speedyZombieIcon : zombie.type === 'big' ? bigZombieIcon : zombieIcon;
  const crop = zombie.type === 'speedy'
    ? [400, 130, 245, 275]
    : zombie.type === 'big'
      ? [395, 100, 250, 310]
      : [405, 130, 230, 275];

  const hitPush = performance.now() < zombie.hitFlashUntil ? 5 * (zombie.hitFlashUntil - performance.now()) / 120 : 0;
  const lean = zombie.type === 'speedy' ? 0.2 : 0;
  const breath = 1;
  ctx.save();
  ctx.translate(Math.cos(zombie.hitAngle || 0) * hitPush, Math.sin(zombie.hitAngle || 0) * hitPush);
  ctx.scale(breath, breath);
  drawZombieArms(zombie, facingAngle);
  if (sprite.complete && sprite.naturalWidth > 0) {
    ctx.save();
    ctx.translate(zombie.x, zombie.y);
    ctx.rotate(facingAngle + Math.PI / 2 + lean);
    ctx.beginPath();
    ctx.arc(0, 0, zombie.radius * 0.94, 0, Math.PI * 2);
    ctx.clip();
    ctx.drawImage(sprite, crop[0], crop[1], crop[2], crop[3], -zombie.radius, -zombie.radius, zombie.radius * 2, zombie.radius * 2);
    ctx.restore();
  } else {
    ctx.fillStyle = '#72bd4b';
    ctx.beginPath();
    ctx.arc(zombie.x, zombie.y, zombie.radius, 0, Math.PI * 2);
    ctx.fill();
  }
  if (performance.now() < zombie.hitFlashUntil) {
    ctx.globalAlpha = 0.45;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.arc(zombie.x, zombie.y, zombie.radius, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();

  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 12px Arial';
  ctx.textAlign = 'center';
  const label = zombie.type === 'speedy' ? 'SPEEDY' : zombie.type === 'big' ? 'BIG' : zombie.type === 'minion' ? 'MINION' : 'ZOMBIE';
  ctx.fillText(label, zombie.x, zombie.y - zombie.radius - 18);
  drawHealthBar(zombie.x, zombie.y - zombie.radius - 13, zombie.radius * 1.65, 5, zombie.maxHits - zombie.hits, zombie.maxHits, performance.now() < zombie.hitFlashUntil ? '#ffffff' : '#ff3939');
}

function drawShots() {
  for (const shot of shots) {
    ctx.save();
    ctx.translate(shot.x, shot.y);
    ctx.rotate(shot.angle);
    ctx.fillStyle = shot.isShotgun ? '#ff7700' : '#ff3333';
    ctx.fillRect(-11, -2, 22, 4);
    ctx.restore();
  }
}

function drawEnemyArrows() {
  for (const arrow of enemyArrows) {
    ctx.save();
    ctx.globalAlpha = 0.25;
    ctx.strokeStyle = '#e7c37a'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(arrow.x - arrow.vx * 0.055, arrow.y - arrow.vy * 0.055); ctx.lineTo(arrow.x, arrow.y); ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.translate(arrow.x, arrow.y);
    ctx.rotate(arrow.angle);
    ctx.strokeStyle = '#714b18';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(-10, 0);
    ctx.lineTo(9, 0);
    ctx.stroke();
    ctx.fillStyle = '#b9bec0';
    ctx.beginPath();
    ctx.moveTo(11, 0);
    ctx.lineTo(5, -4);
    ctx.lineTo(5, 4);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#d8d8d2';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-10, 0);
    ctx.lineTo(-15, -4);
    ctx.moveTo(-10, 0);
    ctx.lineTo(-15, 4);
    ctx.stroke();
    ctx.restore();
  }
}

function drawJesterBlades() {
  const now = performance.now();
  for (const blade of jesterBlades) {
    const elapsed = now - blade.spawnTime;
    const alpha = blade.phase === 'fade' ? Math.min(elapsed / 500, 1) : 1;
    ctx.save();
    if (blade.phase === 'launch') {
      ctx.globalAlpha = 0.28;
      ctx.strokeStyle = '#ed63ff'; ctx.lineWidth = 7;
      ctx.beginPath(); ctx.moveTo(blade.x - blade.vx * 0.075, blade.y - blade.vy * 0.075); ctx.lineTo(blade.x, blade.y); ctx.stroke();
    }
    ctx.globalAlpha = alpha;
    ctx.translate(blade.x, blade.y);
    ctx.rotate(blade.rotation);
    ctx.shadowColor = '#e74dff';
    ctx.shadowBlur = blade.phase === 'fade' ? 8 + elapsed / 120 : 20;
    if (jesterBladeIcon.complete && jesterBladeIcon.naturalWidth > 0) {
      ctx.drawImage(jesterBladeIcon, -42, -42, 84, 84);
    } else {
      ctx.strokeStyle = '#ffd44d';
      ctx.lineWidth = 7;
      ctx.beginPath();
      ctx.arc(0, 0, 23, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }
}

function drawDrones() {
  // Draw drone shots (red rectangles like player bullets)
  for (const s of droneShots) {
    ctx.save();
    ctx.translate(s.x, s.y);
    ctx.rotate(s.angle);
    ctx.fillStyle = '#ff3333';
    ctx.fillRect(-11, -2, 22, 4);
    ctx.restore();
  }

  for (const drone of drones) {
    if (droneIcon.complete && droneIcon.naturalWidth > 0) {
      ctx.save();
      ctx.translate(drone.x, drone.y);
      const tilt = Math.sin(animationTime * 7 + drone.x * 0.02) * 0.14;
      ctx.rotate(drone.aimAngle + tilt);
      ctx.shadowColor = '#00ffff';
      ctx.shadowBlur = 10;
      ctx.drawImage(droneIcon, -18, -12, 36, 24);
      ctx.restore();
    } else {
      ctx.fillStyle = '#00c3ff';
      ctx.beginPath();
      ctx.arc(drone.x, drone.y, 10, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function drawTurrets() {
  for (const shot of turretShots) {
    ctx.save();
    ctx.translate(shot.x, shot.y);
    ctx.rotate(shot.angle);
    ctx.fillStyle = '#ffe36d'; ctx.shadowColor = '#ff9f2e'; ctx.shadowBlur = 10;
    ctx.fillRect(-9, -2, 18, 4);
    ctx.restore();
  }
  for (const turret of turrets) {
    const wheelTurn = animationTime * 12 + turret.phase;
    ctx.save();
    ctx.translate(turret.x, turret.y);
    ctx.rotate(turret.aimAngle);
    ctx.fillStyle = '#3e4855';
    ctx.fillRect(-17, -10, 34, 19);
    ctx.fillStyle = '#9aa7b6';
    ctx.fillRect(-11, -14, 22, 12);
    ctx.fillStyle = '#252b34';
    for (const side of [-1, 1]) {
      ctx.beginPath(); ctx.arc(side * 12, 11, 8, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#adb8c5'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(side * 12 - Math.cos(wheelTurn) * 6, 11 - Math.sin(wheelTurn) * 6); ctx.lineTo(side * 12 + Math.cos(wheelTurn) * 6, 11 + Math.sin(wheelTurn) * 6); ctx.stroke();
    }
    ctx.fillStyle = '#bcc8d4'; ctx.fillRect(4, -22, 7, 15);
    ctx.fillStyle = '#202832'; ctx.fillRect(8, -29, 26, 6);
    ctx.restore();
  }
}

function drawLaserRings() {
  if (!hasLaserRings) return;
  const ringRadius = 5 * 40;
  const spin = animationTime * 2.8;
  ctx.save();
  ctx.translate(player.x, player.y);
  ctx.shadowBlur = 18;
  ctx.lineCap = 'round';
  for (const ring of [0, Math.PI]) {
    ctx.strokeStyle = ring === 0 ? '#6eeeff' : '#c08cff';
    ctx.shadowColor = ctx.strokeStyle;
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.arc(0, 0, ringRadius, spin + ring, spin + ring + Math.PI * 0.74);
    ctx.stroke();
    ctx.lineWidth = 2;
    ctx.globalAlpha = 0.9;
    ctx.beginPath();
    ctx.arc(0, 0, ringRadius + 5, -spin * 1.3 + ring, -spin * 1.3 + ring + Math.PI * 0.42);
    ctx.stroke();
  }
  for (let bolt = 0; bolt < 18; bolt++) {
    const baseAngle = spin * 1.45 + bolt * Math.PI * 2 / 18;
    const arcLength = 0.16 + (bolt % 3) * 0.035;
    ctx.strokeStyle = bolt % 2 ? '#e8c6ff' : '#c4ffff';
    ctx.shadowColor = ctx.strokeStyle;
    ctx.lineWidth = 1.7;
    ctx.beginPath();
    for (let point = 0; point <= 4; point++) {
      const t = point / 4;
      const angle = baseAngle + arcLength * t;
      const jitter = point === 0 || point === 4 ? 0 : Math.sin((bolt + point) * 7.3) * 6;
      const radius = ringRadius + jitter;
      const x = Math.cos(angle) * radius;
      const y = Math.sin(angle) * radius;
      if (point === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  for (let spark = 0; spark < 12; spark++) {
    const angle = -spin * 1.8 + spark * Math.PI * 2 / 12;
    const radius = ringRadius + 12 + Math.sin(animationTime * 8 + spark) * 7;
    ctx.fillStyle = spark % 2 ? '#bca2ff' : '#a9f6ff';
    ctx.beginPath(); ctx.arc(Math.cos(angle) * radius, Math.sin(angle) * radius, 2.2, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
}

function drawBottomHud() {
  if (betweenWaves || won || !alive) return;
  const now = performance.now();
  const secondsLeft = roundEndsAt === Infinity ? '∞' : `${Math.max(0, Math.ceil((roundEndsAt - now) / 1000))}s`;
  const skipVisible = now >= skipUnlocksAt;
  const skipUnlocked = canSkipCurrentRound();
  const centerX = canvas.width / 2;
  const panelY = canvas.height - 54;

  ctx.fillStyle = '#101416d9';
  ctx.fillRect(centerX - 190, panelY - 17, 380, 50);
  ctx.textAlign = 'center';
  ctx.font = 'bold 16px Arial';
  ctx.fillStyle = '#ffffff';
  ctx.fillText(`ROUND ${round}/${maxRounds}  -  ${secondsLeft}  -  ZOMBIES ${zombies.length}`, centerX, panelY + 3);

  if (skipVisible) {
    ctx.fillStyle = skipUnlocked ? '#ff4d4d' : '#596165';
    ctx.fillRect(centerX - 105, panelY + 10, 210, 20);
    ctx.font = 'bold 12px Arial';
    ctx.fillStyle = '#ffffff';
    ctx.fillText('SKIP', centerX, panelY + 25);
    if (!skipUnlocked) {
      ctx.font = '11px Arial';
      ctx.fillStyle = '#c4cccf';
      ctx.fillText('BOSS WAVE - SKIP LOCKED', centerX, panelY - 24);
    }
  } else {
    const unlockSeconds = Math.max(0, Math.ceil((skipUnlocksAt - now) / 1000));
    ctx.font = '12px Arial';
    ctx.fillStyle = '#aab4b6';
    ctx.fillText(`Skip unlocks in ${unlockSeconds}s`, centerX, panelY + 24);
  }
}

function draw() {
  drawGrid();
  drawVisualEffects();
  drawSummonEffects();
  drawDroppedItems();
  drawPlayer();
  drawDrones();
  drawLaserRings();
  for (const zombie of zombies) drawZombie(zombie);
  drawJesterBlades();
  drawShots();
  drawEnemyArrows();
  drawBottomHud();
}

function gameLoop(time) {
  const delta = Math.min((time - lastTime) / 1000, 0.05);
  lastTime = time;
  if (alive && !won) update(delta);
  draw();
  if (alive && !won) requestAnimationFrame(gameLoop);
}

resizeGame();
resetGame();
