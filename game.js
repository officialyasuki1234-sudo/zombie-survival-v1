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

const keys = new Set();
const shots = [];
const enemyArrows = [];
const playerMaxHealth = 10;
const maxRounds = 100;
const roundDurationMs = 20000;
const skipUnlockDelayMs = 6000;
const player = { x: 130, y: 280, radius: 18, speed: 260, moveAngle: 0, isMoving: false };

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
let nextEnemySpawnAt = 0;
let skeletonSpawnQueue = [];
let nextSkeletonSpawnAt = 0;
let spawnSequence = 0;

function zombieCountForRound(roundNumber) {
  return 2 * roundNumber + 3;
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
  const radius = type === 'big' ? 42 : type === 'minion' ? 20 : 28;
  const distanceBlocks = type === 'big' || type === 'skeleton' ? 12 : type === 'speedy' ? 10 : 8;
  const spawn = findSafeSpawn(radius, occupied, distanceBlocks);
  const normalSpeed = 38 + (index % 3) * 5;
  const maxHits = type === 'big' ? 7 : type === 'speedy' || type === 'minion' ? 2 : 3;
  const speed = type === 'speedy' ? normalSpeed * 1.5 : type === 'big' ? normalSpeed * 0.7 : normalSpeed;
  return {
    x: spawn.x,
    y: spawn.y,
    radius,
    speed,
    hits: 0,
    maxHits,
    type,
    phase: Math.random() * Math.PI * 2,
    nextAttackTime: 0,
    attackUntil: 0,
    nextArrowTime: type === 'skeleton' ? performance.now() + 3000 : 0,
    bowUntil: 0,
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

function startWave() {
  const normalCount = zombieCountForRound(round);
  waveSpawnQueue = Array.from({ length: normalCount }, () => ({ type: 'normal' }));
  if (round % 3 === 0) {
    waveSpawnQueue.push({ type: 'speedy' }, { type: 'speedy' });
  }
  if (round % 5 === 0) {
    const groupId = `big-${round}`;
    waveSpawnQueue.push({ type: 'big', groupId });
    for (let minionIndex = 0; minionIndex < 3; minionIndex++) {
      waveSpawnQueue.push({ type: 'minion', groupId, minionIndex });
    }
  }
  skeletonSpawnQueue = round >= 6
    ? Array.from({ length: 3 + Math.floor(Math.random() * 3) }, () => ({ type: 'skeleton' }))
    : [];

  betweenWaves = false;
  const now = performance.now();
  roundEndsAt = now + roundDurationMs;
  skipUnlocksAt = now + skipUnlockDelayMs;
  nextEnemySpawnAt = now + 800;
  nextSkeletonSpawnAt = now + 1000;
  const additions = [];
  if (round % 3 === 0) additions.push('2 SPEEDY');
  if (round % 5 === 0) additions.push('1 BIG + 3 MINIONS');
  if (skeletonSpawnQueue.length > 0) additions.push(`${skeletonSpawnQueue.length} SKELETONS`);
  message.textContent = `ROUND ${round}: ${normalCount} normal${additions.length ? ` + ${additions.join(' + ')}` : ''}`;
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
  waveSpawnQueue = [];
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
  return round % 5 === 0;
}

function canSkipCurrentRound() {
  return alive && !won && !betweenWaves && performance.now() >= skipUnlocksAt
    && !isBossWave();
}

function skipCurrentRound() {
  if (!canSkipCurrentRound()) return;
  // Existing enemies stay alive. Only the remaining unspawned enemies of this round are skipped.
  waveSpawnQueue = [];
  skeletonSpawnQueue = [];
  if (round >= maxRounds) {
    won = true;
    message.textContent = `You finished all ${maxRounds} rounds!`;
    restartButton.hidden = false;
    return;
  }
  round += 1;
  startWave();
}

function spawnNextEnemy() {
  const now = performance.now();
  if (waveSpawnQueue.length === 0 || now < nextEnemySpawnAt) return;
  const entry = waveSpawnQueue.shift();
  let zombie;

  if (entry.type === 'minion') {
    const big = zombies.find((enemy) => enemy.groupId === entry.groupId && enemy.type === 'big');
    zombie = big
      ? makeBigMinion(entry.minionIndex, zombies, big)
      : makeZombie('minion', spawnSequence, zombies);
  } else {
    zombie = makeZombie(entry.type, spawnSequence, zombies);
    zombie.groupId = entry.groupId;
  }

  zombies.push(zombie);
  spawnSequence += 1;
  nextEnemySpawnAt = now + 800;
}

function spawnNextSkeleton() {
  const now = performance.now();
  if (skeletonSpawnQueue.length === 0 || now < nextSkeletonSpawnAt) return;
  skeletonSpawnQueue.shift();
  zombies.push(makeZombie('skeleton', spawnSequence, zombies));
  spawnSequence += 1;
  nextSkeletonSpawnAt = now + 1000;
}

function shootNearestZombie() {
  if (!alive || won || zombies.length === 0) return;
  const now = performance.now();
  if (now - lastShotTime < 300) return;
  lastShotTime = now;

  let target = zombies[0];
  let shortestDistance = Infinity;
  for (const zombie of zombies) {
    const distance = Math.hypot(zombie.x - player.x, zombie.y - player.y);
    if (distance < shortestDistance) {
      shortestDistance = distance;
      target = zombie;
    }
  }
  const dx = target.x - player.x;
  const dy = target.y - player.y;
  const length = Math.hypot(dx, dy) || 1;
  shots.push({
    x: player.x,
    y: player.y,
    vx: (dx / length) * 1100,
    vy: (dy / length) * 1100,
    angle: Math.atan2(dy, dx),
    life: 0.75,
  });
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

function updateShots(delta) {
  for (let shotIndex = shots.length - 1; shotIndex >= 0; shotIndex--) {
    const shot = shots[shotIndex];
    shot.x += shot.vx * delta;
    shot.y += shot.vy * delta;
    shot.life -= delta;
    let hit = false;
    for (const zombie of zombies) {
      if (Math.hypot(shot.x - zombie.x, shot.y - zombie.y) < zombie.radius + 5) {
        zombie.hits += 1;
        hit = true;
        break;
      }
    }
    if (hit || shot.life <= 0) shots.splice(shotIndex, 1);
  }
  zombies = zombies.filter((zombie) => zombie.hits < zombie.maxHits);
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
    arrow.x += arrow.vx * delta;
    arrow.y += arrow.vy * delta;
    arrow.life -= delta;
    const hitPlayer = Math.hypot(arrow.x - player.x, arrow.y - player.y) < player.radius + 5;
    if (hitPlayer) damagePlayer(0.5);
    if (hitPlayer || arrow.life <= 0) enemyArrows.splice(index, 1);
  }
}

function updateZombies(delta) {
  for (const zombie of zombies) {
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
    const attackRange = player.radius + zombie.radius + 5;
    if (distance > attackRange) {
      const movement = Math.min(zombie.speed * delta, distance - attackRange);
      zombie.x += (dx / distance) * movement;
      zombie.y += (dy / distance) * movement;
    }
  }

  resolveHitboxes();

  const now = performance.now();
  for (const zombie of zombies) {
    if (zombie.type === 'skeleton') {
      if (now >= zombie.nextArrowTime) {
        shootArrow(zombie);
        zombie.nextArrowTime = now + 3000;
        zombie.bowUntil = now + 260;
      }
      continue;
    }
    const distance = Math.hypot(player.x - zombie.x, player.y - zombie.y);
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
  shootNearestZombie();
  updateShots(delta);
  updateZombies(delta);
  updateEnemyArrows(delta);

  const remaining = zombies.length;
  if (remaining === 0 && waveSpawnQueue.length === 0 && skeletonSpawnQueue.length === 0) {
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

function drawPlayer() {
  ctx.fillStyle = '#4ba3ff';
  ctx.beginPath();
  ctx.arc(player.x, player.y, player.radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 14px Arial';
  ctx.textAlign = 'center';
  ctx.fillText('YOU', player.x, player.y - player.radius - 22);
  drawHealthBar(player.x, player.y - player.radius - 16, 46, 6, playerHealth, playerMaxHealth, '#ff4545');
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
  const drawingBow = performance.now() < skeleton.bowUntil;

  // Simple wooden bow and string, rotated toward the player.
  ctx.save();
  ctx.translate(skeleton.x, skeleton.y);
  ctx.rotate(facingAngle);
  ctx.strokeStyle = '#4a2d13';
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.arc(13, 0, 15, -Math.PI / 2, Math.PI / 2, false);
  ctx.stroke();
  ctx.strokeStyle = '#e7dfba';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(13, -15);
  ctx.lineTo(drawingBow ? -8 : 5, 0);
  ctx.lineTo(13, 15);
  ctx.stroke();
  ctx.restore();

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

  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 12px Arial';
  ctx.textAlign = 'center';
  ctx.fillText('SKELETON', skeleton.x, skeleton.y - skeleton.radius - 18);
  drawHealthBar(skeleton.x, skeleton.y - skeleton.radius - 13, skeleton.radius * 1.65, 5, skeleton.maxHits - skeleton.hits, skeleton.maxHits, '#e9e2cc');
}

function drawZombie(zombie) {
  if (zombie.type === 'skeleton') {
    drawSkeleton(zombie);
    return;
  }
  const facingAngle = Math.atan2(player.y - zombie.y, player.x - zombie.x);
  const sprite = zombie.type === 'speedy' ? speedyZombieIcon : zombie.type === 'big' ? bigZombieIcon : zombieIcon;
  const crop = zombie.type === 'speedy'
    ? [400, 130, 245, 275]
    : zombie.type === 'big'
      ? [395, 100, 250, 310]
      : [405, 130, 230, 275];

  drawZombieArms(zombie, facingAngle);
  if (sprite.complete && sprite.naturalWidth > 0) {
    ctx.save();
    ctx.translate(zombie.x, zombie.y);
    ctx.rotate(facingAngle + Math.PI / 2);
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

  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 12px Arial';
  ctx.textAlign = 'center';
  const label = zombie.type === 'speedy' ? 'SPEEDY' : zombie.type === 'big' ? 'BIG' : zombie.type === 'minion' ? 'MINION' : 'ZOMBIE';
  ctx.fillText(label, zombie.x, zombie.y - zombie.radius - 18);
  drawHealthBar(zombie.x, zombie.y - zombie.radius - 13, zombie.radius * 1.65, 5, zombie.maxHits - zombie.hits, zombie.maxHits, '#ff3939');
}

function drawShots() {
  ctx.fillStyle = '#ff3333';
  for (const shot of shots) {
    ctx.save();
    ctx.translate(shot.x, shot.y);
    ctx.rotate(shot.angle);
    ctx.fillRect(-11, -2, 22, 4);
    ctx.restore();
  }
}

function drawEnemyArrows() {
  for (const arrow of enemyArrows) {
    ctx.save();
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

function drawBottomHud() {
  if (betweenWaves || won || !alive) return;
  const now = performance.now();
  const secondsLeft = Math.max(0, Math.ceil((roundEndsAt - now) / 1000));
  const skipVisible = now >= skipUnlocksAt;
  const skipUnlocked = canSkipCurrentRound();
  const centerX = canvas.width / 2;
  const panelY = canvas.height - 54;

  ctx.fillStyle = '#101416d9';
  ctx.fillRect(centerX - 190, panelY - 17, 380, 50);
  ctx.textAlign = 'center';
  ctx.font = 'bold 16px Arial';
  ctx.fillStyle = '#ffffff';
  ctx.fillText(`ROUND ${round}/${maxRounds}  -  ${secondsLeft}s  -  ZOMBIES ${zombies.length}`, centerX, panelY + 3);

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
  drawPlayer();
  for (const zombie of zombies) drawZombie(zombie);
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
