import Phaser from 'phaser';
import bus from '../engine/EventBus.js';

const BUDDER_ID = 'budder_sphinx';
const BUDDER_VORTEX_TEXTURE = 'budder_spacetime_vortex';
const BUDDER_BLUE_STAR_TEXTURE = 'budder_bluestar_orbit';
const BUDDER_PURPLE_STAR_TEXTURE = 'budder_purple_star_orbit';
const BUDDER_PLANET_TEXTURE = 'budder_planet_orbit';
const BUDDER_MOON_TEXTURE = 'budder_moon_orbit';
const BUDDER_BLACK_PLANET_TEXTURE = 'budder_blackplanet_orbit';
const ASIPHYX_PULL_TEAL_TEXTURE = 'asiphyx_gravity_pull_teal';
const ASIPHYX_PULL_RED_TEXTURE = 'asiphyx_gravity_pull_red';

export class CombatScene extends Phaser.Scene {
  constructor() {
    super('CombatScene');
    this.gameRef = null;
    this.heroSprite = null;
    this.enemySprites = [];
    this.eventListeners = [];
  }

  init(data) {
    this.gameRef = data.game;
    this.selectedTargetIndex = data.selectedTarget ?? 0;
    this.enemySprites = [];
  }

  preload() {
    const state = this.gameRef?.state;
    const hero = state?.hero;
    if (hero) {
      // Preload the hero's portrait as their battle sprite
      const portraitPath = hero.battlePortrait || hero.avatar || hero.portrait;
      this.load.image(`hero_${hero.id}`, portraitPath);
    }

    if (state && state.enemies) {
      state.enemies.forEach((enemy) => {
        if (enemy.idleSprite) {
          const isBudder = enemy.templateId === 'budder_sphinx' || enemy.id === 'budder_sphinx';
          this.load.spritesheet(`enemy_idle_${enemy.id}`, enemy.idleSprite, {
            frameWidth: isBudder ? 512 : 384,
            frameHeight: isBudder ? 512 : 384
          });
        }
        if (enemy.sprite) {
          this.load.image(`enemy_static_${enemy.id}`, enemy.sprite);
        }
      });
    }

    if (state?.enemies?.some(enemy => this.isBudderEnemy(enemy))) {
      this.load.spritesheet(BUDDER_VORTEX_TEXTURE, '/assets/enemies/fx/budder_spacetime_vortex_strip.png', {
        frameWidth: 100,
        frameHeight: 100
      });
      this.load.spritesheet(BUDDER_BLUE_STAR_TEXTURE, '/assets/enemies/fx/budder_bluestar_orbit_strip.png', {
        frameWidth: 200,
        frameHeight: 200
      });
      this.load.spritesheet(BUDDER_PURPLE_STAR_TEXTURE, '/assets/enemies/fx/budder_purple_star_orbit_strip.png', {
        frameWidth: 200,
        frameHeight: 200
      });
      this.load.spritesheet(BUDDER_PLANET_TEXTURE, '/assets/enemies/fx/budder_planet_orbit_strip.png', {
        frameWidth: 100,
        frameHeight: 100
      });
      this.load.spritesheet(BUDDER_MOON_TEXTURE, '/assets/enemies/fx/budder_moon_orbit_strip.png', {
        frameWidth: 100,
        frameHeight: 100
      });
      this.load.spritesheet(BUDDER_BLACK_PLANET_TEXTURE, '/assets/enemies/fx/budder_blackplanet_orbit_strip.png', {
        frameWidth: 100,
        frameHeight: 100
      });
    }

    this.load.spritesheet(ASIPHYX_PULL_TEAL_TEXTURE, '/assets/heroes/fx/asiphyx_gravity_pull_teal_strip.png', {
      frameWidth: 200,
      frameHeight: 200
    });
    this.load.spritesheet(ASIPHYX_PULL_RED_TEXTURE, '/assets/heroes/fx/asiphyx_gravity_pull_red_strip.png', {
      frameWidth: 200,
      frameHeight: 200
    });
  }

  create() {
    window.__phyxCombatSceneCreateCount = (window.__phyxCombatSceneCreateCount ?? 0) + 1;
    const width = this.scale.width;
    const height = this.scale.height;

    // ─── 1. Background Grid ───
    this.createGridBackground(width, height);

    // ─── 2. Draw Hero Sprite ───
    this.createHero();

    // ─── 3. Draw Enemies ───
    this.createEnemies();
    this.queuePendingAsiphyxGravityPull();

    // Update target highlight initially
    this.enemySprites.forEach((sprite, idx) => {
      this.updateEnemyTargetHighlight(sprite, idx);
    });

    // ─── 4. Wire Event Bus ───
    this.setupEventBusListeners();
  }

  update() {
    // Floating idle animation for player
    if (this.heroSprite && this.heroSprite.active) {
      const t = this.time.now * 0.0025;
      this.heroSprite.y = 150 + Math.sin(t) * 8; // Offset vertically for responsive height
      
      // Floating hero base glow
      if (this.heroGlow) {
        this.heroGlow.y = this.heroSprite.y + 70;
        this.heroGlow.scaleX = 1 + Math.sin(t) * 0.05;
      }
    }
  }

  isBudderEnemy(enemy) {
    return enemy?.templateId === BUDDER_ID || enemy?.id === BUDDER_ID || String(enemy?.id ?? '').startsWith(`${BUDDER_ID}_`);
  }

  isBossEnemy(enemy) {
    return enemy?.type === 'boss' || enemy?.tier === 'boss' || this.isBudderEnemy(enemy);
  }

  ensureSheetAnimation(textureKey, animKey, frameRate, { reverse = false } = {}) {
    if (!this.textures.exists(textureKey)) return false;
    if (!this.anims.exists(animKey)) {
      const frames = this.anims.generateFrameNumbers(textureKey);
      this.anims.create({
        key: animKey,
        frames: reverse ? frames.reverse() : frames,
        frameRate,
        repeat: -1
      });
    }
    return true;
  }

  queuePendingAsiphyxGravityPull() {
    if (this.gameRef?.state?.hero?.id !== 'asiphyx') return;
    const combatState = this.gameRef?.combat?.combatState;
    if (!combatState) return;

    const pullSignal = [
      combatState.caitExtraActions ?? 0,
      combatState.markedTargetCritMult ?? 1,
      combatState.kineticComboStacks ?? 0,
      combatState.caitBlockBonus ?? 0,
    ].join('|');

    if (pullSignal === '0|1|0|0' || this.gameRef.__lastAsiphyxPullSignal === pullSignal) return;
    this.gameRef.__lastAsiphyxPullSignal = pullSignal;
    this.time.delayedCall(80, () => {
      this.spawnAsiphyxGravityPull(combatState.markedTargetIndex ?? this.selectedTargetIndex ?? 0);
    });
  }

  createGridBackground(width, height) {
    const graphics = this.add.graphics();
    graphics.lineStyle(1, 0x00e5ff, 0.08);

    // Draw horizontal grid lines with perspective spacing
    const horizon = height * 0.45;
    for (let y = horizon; y < height; y += 20 + (y - horizon) * 0.15) {
      graphics.lineBetween(0, y, width, y);
    }

    // Draw vertical perspective grid lines
    const cols = 20;
    for (let i = 0; i <= cols; i++) {
      const ratio = i / cols;
      const xTop = width * (0.2 + ratio * 0.6);
      const xBottom = width * (-0.5 + ratio * 2.0);
      graphics.lineBetween(xTop, horizon, xBottom, height);
    }

    // Horizon glowing boundary line
    const horizonLine = this.add.graphics();
    horizonLine.lineStyle(2, 0x00e5ff, 0.35);
    horizonLine.lineBetween(0, horizon, width, horizon);
  }

  createHero() {
    const state = this.gameRef?.state;
    const hero = state?.hero;
    if (!hero) return;

    const heroColor = Phaser.Display.Color.HexStringToColor(hero.color || '#9933ff').color;

    this.heroGlow = this.add.container(180, 220);
    for (let i = 0; i < 5; i++) {
      const alpha = 0.22 * (1 - i / 5);
      const w = 110 + i * 8;
      const h = 18 + i * 2;
      const ellipse = this.add.ellipse(0, 0, w, h, heroColor, alpha);
      this.heroGlow.add(ellipse);
    }

    this.heroSprite = this.add.container(180, 150);

    const anchor = this.add.graphics();
    anchor.lineStyle(2, heroColor, 0.7);
    anchor.strokeCircle(0, -6, 22);
    anchor.lineStyle(1, 0x00e5ff, 0.42);
    anchor.strokeCircle(0, -6, 34);
    anchor.lineBetween(-44, -6, -28, -6);
    anchor.lineBetween(28, -6, 44, -6);
    anchor.lineBetween(0, -50, 0, -34);
    anchor.lineBetween(0, 22, 0, 38);
    this.heroSprite.add(anchor);

    const sigil = this.add.text(0, -7, 'A', {
      fontFamily: 'Press Start 2P, monospace',
      fontSize: '18px',
      color: '#e8d7ff'
    }).setOrigin(0.5);
    this.heroSprite.add(sigil);

    const tagBg = this.add.graphics();
    tagBg.fillStyle(0x000000, 0.55);
    tagBg.lineStyle(1, heroColor, 0.44);
    tagBg.fillRectShape(new Phaser.Geom.Rectangle(-58, 36, 116, 16));
    tagBg.strokeRectShape(new Phaser.Geom.Rectangle(-58, 36, 116, 16));
    this.heroSprite.add(tagBg);

    const tagTxt = this.add.text(0, 44, `${hero.name.toUpperCase()} : ACTIVE`, {
      fontFamily: 'Press Start 2P, monospace',
      fontSize: '6px',
      color: '#ffffff'
    }).setOrigin(0.5);
    this.heroSprite.add(tagTxt);

    // HP Bar
    this.heroHpBar = this.add.graphics();
    this.heroSprite.add(this.heroHpBar);

    this.updateHeroHp();
  }

  updateHeroHp() {
    if (!this.heroHpBar || !this.heroHpBar.active) return;
    const snap = this.gameRef?.getSnapshot();
    if (!snap) return;

    this.heroHpBar.clear();

    const hpWidth = 100;
    const hpHeight = 8;
    const startX = -50;
    const startY = -85;

    // Background (Dark)
    this.heroHpBar.fillStyle(0x333333, 0.8);
    this.heroHpBar.fillRect(startX, startY, hpWidth, hpHeight);

    // HP Fill
    const pct = Math.max(0, Math.min(1.0, snap.hp / snap.maxHp));
    const fillCol = snap.hp / snap.maxHp <= 0.35 ? 0xff3344 : (snap.hp / snap.maxHp <= 0.70 ? 0xffcc00 : 0x33ff99);
    this.heroHpBar.fillStyle(fillCol, 1);
    this.heroHpBar.fillRect(startX, startY, hpWidth * pct, hpHeight);

    // HP text
    if (this.heroHpText) this.heroHpText.destroy();
    this.heroHpText = this.add.text(startX + hpWidth / 2, startY - 10, `${snap.hp}/${snap.maxHp} HP`, {
      fontFamily: 'VT323, monospace',
      fontSize: '12px',
      color: '#ff3344',
      fontWeight: 'bold'
    }).setOrigin(0.5);
    this.heroSprite.add(this.heroHpText);

    // Shield/Block badge
    if (this.heroBlockBadge) this.heroBlockBadge.destroy();
    if (snap.block > 0) {
      this.heroBlockBadge = this.add.container(startX - 15, startY + 4);
      
      const badgeG = this.add.graphics();
      badgeG.fillStyle(0x00e5ff, 1);
      badgeG.beginPath();
      badgeG.moveTo(0, -8);
      badgeG.lineTo(8, -8);
      badgeG.lineTo(8, 0);
      badgeG.lineTo(0, 8);
      badgeG.lineTo(-8, 0);
      badgeG.lineTo(-8, -8);
      badgeG.closePath();
      badgeG.fillPath();
      
      const badgeT = this.add.text(0, 0, snap.block.toString(), {
        fontFamily: 'VT323, monospace',
        fontSize: '10px',
        color: '#000000',
        fontWeight: 'bold'
      }).setOrigin(0.5);
      
      this.heroBlockBadge.add(badgeG);
      this.heroBlockBadge.add(badgeT);
      this.heroSprite.add(this.heroBlockBadge);
    }
  }

  createEnemies() {
    const state = this.gameRef?.state;
    if (!state || !state.enemies) return;

    // Remove existing sprites
    this.enemySprites.forEach(s => s.destroy());
    this.enemySprites = [];

    const width = this.scale.width;
    const startY = 150; // Align with hero y center

    const enemyCount = state.enemies.length;
    const enemyAreaWidth = width * 0.52; // Right 52% of the screen
    const enemyAreaStart = width * 0.45; // Starts at 45%

    state.enemies.forEach((enemy, idx) => {
      const isBoss = this.isBossEnemy(enemy);
      const isBudder = this.isBudderEnemy(enemy);
      // Evenly distribute X positions
      let x = enemyAreaStart + (enemyAreaWidth * (idx + 0.5) / enemyCount);
      if (enemyCount === 1) {
        x = enemyAreaStart + enemyAreaWidth / 2;
      }
      
      // Stagger Y slightly if there are multiple enemies
      let staggerY = 0;
      if (enemyCount > 1) {
        staggerY = idx % 2 === 0 ? -15 : 15;
      }
      const y = startY + staggerY;

      const container = this.add.container(x, y);
      container.setData('index', idx);
      container.setData('enemyId', enemy.id);
      container.setData('isBudder', isBudder);

      // Target interaction zone (invisible hit area, no visible brick)
      let hitW = isBoss ? 230 : 100;
      let hitH = isBoss ? 220 : 100;
      const hitArea = this.add.graphics();
      hitArea.fillStyle(0xffffff, 0); // fully transparent
      const hitRect = new Phaser.Geom.Rectangle(-hitW/2, -hitH/2, hitW, hitH);
      hitArea.fillRectShape(hitRect);
      container.add(hitArea);

      // Platform glow under enemy (replaces the dark brick)
      const glowColor = isBoss ? 0xff66cc : (enemy.type === 'elite' ? 0x9933ff : 0x505070);
      const platformGlow = this.add.graphics();
      const platformW = isBoss ? 160 : 70;
      for (let i = 0; i < 4; i++) {
        const alpha = 0.25 * (1 - i / 4);
        platformGlow.fillStyle(glowColor, alpha);
        platformGlow.fillEllipse(0, hitH/2 - 10, platformW - i * 12, 16 - i * 2);
      }
      container.add(platformGlow);

      // Render Enemy Art (Animated/Static) or Fallback Emoji
      const hasIdle = enemy.idleSprite && this.textures.exists(`enemy_idle_${enemy.id}`);
      const hasStatic = enemy.sprite && this.textures.exists(`enemy_static_${enemy.id}`);

      let spriteObj = null;

      if (hasIdle) {
        const animKey = `enemy_anim_${enemy.id}`;
        if (!this.anims.exists(animKey)) {
          this.anims.create({
            key: animKey,
            frames: this.anims.generateFrameNumbers(`enemy_idle_${enemy.id}`),
            frameRate: isBudder ? 15 : 6,
            repeat: -1
          });
        }

        spriteObj = this.add.sprite(0, isBudder ? 10 : -10, `enemy_idle_${enemy.id}`);
        spriteObj.play(animKey);
      } else if (hasStatic) {
        spriteObj = this.add.image(0, isBudder ? 10 : -10, `enemy_static_${enemy.id}`);
      }

      if (spriteObj) {
        const displayW = isBoss ? 182 : (enemy.type === 'elite' ? 110 : 90);
        const displayH = isBoss ? 182 : (enemy.type === 'elite' ? 110 : 90);
        spriteObj.setDisplaySize(displayW, displayH);
        container.add(spriteObj);
      } else {
        // Fallback text
        const emojiTxt = this.add.text(0, -10, enemy.emoji ?? '👾', {
          fontSize: isBoss ? '90px' : '48px',
        }).setOrigin(0.5);
        container.add(emojiTxt);
      }

      // Boss float animation
      if (isBoss) {
        this.createBossDistortion(container, hitW, hitH, glowColor, enemy);
        this.tweens.add({
          targets: container,
          y: y - 12,
          duration: 2200,
          yoyo: true,
          repeat: -1,
          ease: 'Sine.inOut'
        });
      }

      // Target Highlight graphics (corner brackets, drawn on demand)
      const targetG = this.add.graphics();
      container.add(targetG);
      container.setData('targetHighlight', targetG);
      container.setData('hitW', hitW);
      container.setData('hitH', hitH);

      // Enemy Name (floating text, no box)
      const nameTxt = this.add.text(0, hitH/2 + 4, enemy.name.toUpperCase(), {
        fontFamily: 'Press Start 2P, monospace',
        fontSize: isBoss ? '7px' : '5px',
        color: isBoss ? '#ff66cc' : '#ffffff',
        stroke: '#000000',
        strokeThickness: 3
      }).setOrigin(0.5);
      container.add(nameTxt);

      // HP Bar & Block
      const hpG = this.add.graphics();
      container.add(hpG);
      container.setData('hpBar', hpG);

      this.updateEnemyHp(container, enemy);

      // Hover / Click interaction on the transparent hit area
      hitArea.setInteractive(hitRect, Phaser.Geom.Rectangle.Contains);
      hitArea.on('pointerdown', () => {
        bus.emit('toast', { text: `Targeted: ${enemy.name}`, type: 'info' });
        const selectedEvt = new CustomEvent('phaserSelectTarget', { detail: { index: idx } });
        window.dispatchEvent(selectedEvt);
      });

      // Simple hover scale effect
      hitArea.on('pointerover', () => {
        container.setScale(1.05);
      });
      hitArea.on('pointerout', () => {
        container.setScale(1.0);
      });

      this.add.existing(container);
      this.enemySprites.push(container);
    });
  }

  createBossDistortion(container, hitW, hitH, color = 0xff3344, enemy = null) {
    const fx = this.add.container(0, 0);
    container.addAt(fx, 1);
    const frontFx = this.add.container(0, 0);

    if (this.isBudderEnemy(enemy)) {
      container.add(frontFx);
      this.createBudderSpacetimeLayer(fx, hitW, hitH, frontFx);
    }

    for (let ringIndex = 0; ringIndex < 3; ringIndex++) {
      const ring = this.add.ellipse(0, 0, hitW - 22 + ringIndex * 18, hitH - 34 + ringIndex * 10);
      ring.setStrokeStyle(1, color, 0.18 - ringIndex * 0.04);
      ring.setFillStyle(color, 0);
      ring.setAngle(ringIndex * 21);
      fx.add(ring);
      this.tweens.add({
        targets: ring,
        angle: ring.angle + (ringIndex % 2 === 0 ? 360 : -360),
        scaleX: 1.08,
        scaleY: 0.92,
        alpha: 0.35,
        duration: 3600 + ringIndex * 700,
        repeat: -1,
        yoyo: true,
        ease: 'Sine.inOut'
      });
    }

    for (let i = 0; i < 16; i++) {
      const angle = (Math.PI * 2 * i) / 16;
      const radiusX = hitW * (0.42 + Math.random() * 0.18);
      const radiusY = hitH * (0.34 + Math.random() * 0.16);
      const mote = this.add.circle(Math.cos(angle) * radiusX, Math.sin(angle) * radiusY, 1.5 + Math.random() * 2, color, 0.45 + Math.random() * 0.35);
      fx.add(mote);
      this.tweens.add({
        targets: mote,
        x: Math.cos(angle + Math.PI * 1.35) * radiusX,
        y: Math.sin(angle + Math.PI * 1.35) * radiusY,
        alpha: 0.12,
        duration: 1800 + Math.random() * 1800,
        repeat: -1,
        yoyo: true,
        ease: 'Sine.inOut'
      });
    }

    for (let i = 0; i < 8; i++) {
      const streak = this.add.rectangle(-hitW / 2 + Math.random() * hitW, -hitH / 2 + Math.random() * hitH, 18 + Math.random() * 24, 1, color, 0.22);
      streak.setAngle(-18 + Math.random() * 36);
      fx.add(streak);
      this.tweens.add({
        targets: streak,
        x: streak.x + 24 + Math.random() * 40,
        y: streak.y - 12 + Math.random() * 24,
        alpha: 0,
        duration: 900 + Math.random() * 1200,
        repeat: -1,
        delay: Math.random() * 800,
        ease: 'Quad.out'
      });
    }
  }

  createBudderSpacetimeLayer(fx, hitW, hitH, frontFx = fx) {
    const vortexReady = this.ensureSheetAnimation(BUDDER_VORTEX_TEXTURE, `${BUDDER_VORTEX_TEXTURE}_counter_loop`, 23, { reverse: true });
    const driftVortexReady = this.ensureSheetAnimation(BUDDER_VORTEX_TEXTURE, `${BUDDER_VORTEX_TEXTURE}_counter_drift_loop`, 17, { reverse: true });
    const blueReady = this.ensureSheetAnimation(BUDDER_BLUE_STAR_TEXTURE, `${BUDDER_BLUE_STAR_TEXTURE}_loop`, 19);
    const purpleReady = this.ensureSheetAnimation(BUDDER_PURPLE_STAR_TEXTURE, `${BUDDER_PURPLE_STAR_TEXTURE}_loop`, 17);
    const planetReady = this.ensureSheetAnimation(BUDDER_PLANET_TEXTURE, `${BUDDER_PLANET_TEXTURE}_loop`, 16);
    const moonReady = this.ensureSheetAnimation(BUDDER_MOON_TEXTURE, `${BUDDER_MOON_TEXTURE}_loop`, 15);
    const blackPlanetReady = this.ensureSheetAnimation(BUDDER_BLACK_PLANET_TEXTURE, `${BUDDER_BLACK_PLANET_TEXTURE}_loop`, 14);

    if (vortexReady) {
      const mainVortex = this.add.sprite(0, -2, BUDDER_VORTEX_TEXTURE);
      mainVortex.play({ key: `${BUDDER_VORTEX_TEXTURE}_counter_loop`, startFrame: 3 });
      mainVortex.setDisplaySize(640, 292);
      mainVortex.setAlpha(0.78);
      mainVortex.setBlendMode('ADD');
      fx.add(mainVortex);

      this.tweens.add({
        targets: mainVortex,
        alpha: 0.92,
        scaleX: 1.025,
        scaleY: 1.035,
        duration: 1600,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.inOut'
      });
    }

    if (driftVortexReady) {
      const counterVortex = this.add.sprite(0, -2, BUDDER_VORTEX_TEXTURE);
      counterVortex.play({ key: `${BUDDER_VORTEX_TEXTURE}_counter_drift_loop`, startFrame: 9 });
      counterVortex.setDisplaySize(780, 248);
      counterVortex.setAlpha(0.42);
      counterVortex.setAngle(18);
      counterVortex.setBlendMode('ADD');
      fx.addAt(counterVortex, 0);

      this.tweens.add({
        targets: counterVortex,
        alpha: 0.64,
        scaleX: 1.018,
        scaleY: 0.985,
        duration: 2100,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.inOut'
      });
    }

    const orbitConfigs = [
      { texture: BUDDER_BLUE_STAR_TEXTURE, anim: `${BUDDER_BLUE_STAR_TEXTURE}_loop`, ready: blueReady, radiusX: 218, radiusY: 72, size: 128, alpha: 0.92, duration: 3370, startAngle: 310, spinDuration: 1760, delay: 120, startFrame: 2, bodyAngle: 28, lane: 'side' },
      { texture: BUDDER_PURPLE_STAR_TEXTURE, anim: `${BUDDER_PURPLE_STAR_TEXTURE}_loop`, ready: purpleReady, radiusX: 108, radiusY: 134, size: 130, alpha: 0.9, duration: 3090, startAngle: 55, spinDuration: 2240, delay: 540, startFrame: 7, bodyAngle: 115, lane: 'vertical', layer: 'front' },
      { texture: BUDDER_PLANET_TEXTURE, anim: `${BUDDER_PLANET_TEXTURE}_loop`, ready: planetReady, radiusX: 274, radiusY: 96, size: 96, alpha: 0.94, duration: 4930, startAngle: 180, spinDuration: 2680, delay: 260, startFrame: 4, bodyAngle: 208, lane: 'side' },
      { texture: BUDDER_MOON_TEXTURE, anim: `${BUDDER_MOON_TEXTURE}_loop`, ready: moonReady, radiusX: 88, radiusY: 146, size: 74, alpha: 0.9, duration: 3810, startAngle: 116, spinDuration: 1970, delay: 780, startFrame: 1, bodyAngle: 330, lane: 'vertical', layer: 'front' },
      { texture: BUDDER_BLACK_PLANET_TEXTURE, anim: `${BUDDER_BLACK_PLANET_TEXTURE}_loop`, ready: blackPlanetReady, radiusX: 252, radiusY: 88, size: 88, alpha: 0.88, duration: 5470, startAngle: 244, spinDuration: 2930, delay: 390, startFrame: 6, bodyAngle: 66, lane: 'side' },
    ];

    orbitConfigs.forEach((config) => {
      if (!config.ready) return;
      const body = this.add.sprite(0, -2, config.texture);
      body.play({ key: config.anim, startFrame: config.startFrame });
      body.setBlendMode('ADD');
      body.setAngle(config.bodyAngle);
      (config.layer === 'front' ? frontFx : fx).add(body);
      this.positionOrbitBody(body, config, config.startAngle);

      const orbitState = { angle: config.startAngle };
      this.tweens.add({
        targets: orbitState,
        angle: config.startAngle + 360,
        duration: config.duration,
        delay: config.delay,
        repeat: -1,
        ease: 'Linear',
        onUpdate: () => this.positionOrbitBody(body, config, orbitState.angle)
      });

      this.tweens.add({
        targets: body,
        angle: config.bodyAngle + 360,
        duration: config.spinDuration,
        delay: Math.floor(config.delay * 0.55),
        repeat: -1,
        ease: 'Linear'
      });
    });

    this.createBudderGlowBits(fx, frontFx, hitW, hitH);
    this.createBudderParticleLanes(frontFx, hitW, hitH);

    for (let i = 0; i < 7; i++) {
      const fracture = this.add.rectangle(0, 0, hitW * (0.82 + i * 0.06), 1, i % 2 === 0 ? 0x66f7ff : 0xff66e8, 0.42);
      fracture.setAngle(-36 + i * 18);
      fracture.setBlendMode('ADD');
      (i % 3 === 0 ? frontFx : fx).add(fracture);
      this.tweens.add({
        targets: fracture,
        scaleX: 0.5,
        alpha: 0.12,
        duration: 760 + i * 190,
        delay: i * 170,
        repeat: -1,
        yoyo: true,
        ease: 'Sine.inOut'
      });
    }
  }

  positionOrbitBody(body, config, degrees) {
    const radians = Phaser.Math.DegToRad(degrees);
    const depth = (Math.sin(radians) + 1) / 2;
    const scale = 0.56 + depth * 0.5;
    if (config.lane === 'vertical') {
      body.x = Math.cos(radians) * config.radiusX;
      body.y = -4 + Math.sin(radians) * config.radiusY;
    } else {
      body.x = Math.cos(radians) * config.radiusX;
      body.y = -6 + Math.sin(radians) * config.radiusY;
    }
    body.setDisplaySize(config.size * scale, config.size * scale);
    body.setAlpha(Math.min(1, config.alpha * (0.9 + depth * 0.1)));
  }

  createBudderGlowBits(fx, frontFx, hitW, hitH) {
    const glowPoints = [
      { x: -74, y: -58, color: 0x66f7ff, delay: 0, front: false },
      { x: 82, y: -38, color: 0xff66e8, delay: 260, front: true },
      { x: -36, y: 74, color: 0xb0ff6a, delay: 520, front: true },
      { x: 44, y: 54, color: 0xffffff, delay: 780, front: false },
      { x: 0, y: -98, color: 0xffd166, delay: 1040, front: true },
    ];

    glowPoints.forEach((point, index) => {
      const halo = this.add.circle(point.x, point.y, 10 + index * 1.5, point.color, 0.42);
      halo.setBlendMode('ADD');
      (point.front ? frontFx : fx).add(halo);
      this.tweens.add({
        targets: halo,
        scale: 2.4 + index * 0.15,
        alpha: 0.9,
        duration: 1050 + index * 140,
        delay: point.delay,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.inOut'
      });

      const core = this.add.circle(point.x, point.y, 3, point.color, 0.9);
      core.setBlendMode('ADD');
      (point.front ? frontFx : fx).add(core);
      this.tweens.add({
        targets: core,
        scale: 1.8,
        alpha: 1,
        duration: 680 + index * 90,
        delay: point.delay + 120,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.inOut'
      });
    });

    const corona = this.add.ellipse(0, 8, hitW * 0.76, hitH * 0.42);
    corona.setStrokeStyle(2, 0xff66e8, 0.82);
    corona.setBlendMode('ADD');
    frontFx.add(corona);
    this.tweens.add({
      targets: corona,
      alpha: 0.92,
      scaleX: 1.12,
      scaleY: 0.84,
      duration: 1450,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.inOut'
    });
  }

  createBudderParticleLanes(frontFx, hitW, hitH) {
    const colors = [0x66f7ff, 0xff66e8, 0xb0ff6a, 0xffffff];
    for (let i = 0; i < 34; i++) {
      const lane = i % 3;
      const color = colors[i % colors.length];
      const mote = this.add.circle(0, 0, lane === 1 ? 2.2 : 1.6, color, 0.9);
      mote.setBlendMode('ADD');
      frontFx.add(mote);

      const orbitState = { angle: i * 31 };
      const radiusX = lane === 0 ? hitW * 0.18 : lane === 1 ? hitW * 0.34 : hitW * 0.1;
      const radiusY = lane === 0 ? hitH * 0.58 : lane === 1 ? hitH * 0.18 : hitH * 0.5;
      const tilt = lane === 1 ? 0.25 : 1.0;
      const updateMote = () => {
        const radians = Phaser.Math.DegToRad(orbitState.angle);
        const depth = (Math.sin(radians) + 1) / 2;
        mote.x = Math.cos(radians) * radiusX;
        mote.y = -4 + Math.sin(radians) * radiusY * tilt + (lane === 2 ? Math.cos(radians) * 22 : 0);
        const scale = 0.7 + depth * 1.2;
        mote.setScale(scale);
        mote.setAlpha(0.9 + depth * 0.1);
      };
      updateMote();

      this.tweens.add({
        targets: orbitState,
        angle: orbitState.angle + 360,
        duration: 1350 + lane * 620 + (i % 5) * 130,
        delay: i * 55,
        repeat: -1,
        ease: 'Linear',
        onUpdate: updateMote
      });
    }
  }

  updateEnemyHp(container, enemyData) {
    const hpG = container.getData('hpBar');
    if (!hpG || !hpG.active) return;

    hpG.clear();

    const hpWidth = 80;
    const hpHeight = 6;
    const startX = -hpWidth / 2;
    const startY = 60;

    // Dark Background
    hpG.fillStyle(0x333333, 0.8);
    hpG.fillRect(startX, startY, hpWidth, hpHeight);

    // HP Fill
    const pct = Math.max(0, Math.min(1.0, enemyData.hp / enemyData.maxHp));
    const fillCol = enemyData.hp / enemyData.maxHp <= 0.35 ? 0xff3344 : (enemyData.hp / enemyData.maxHp <= 0.70 ? 0xffcc00 : 0xff3399);
    hpG.fillStyle(fillCol, 1);
    hpG.fillRect(startX, startY, hpWidth * pct, hpHeight);

    // Hp label
    const hpTxt = container.getData('hpText');
    if (hpTxt) hpTxt.destroy();
    const newHpTxt = this.add.text(0, startY + 12, `${enemyData.hp}/${enemyData.maxHp} HP`, {
      fontFamily: 'VT323, monospace',
      fontSize: '11px',
      color: '#ff3399',
      fontWeight: 'bold'
    }).setOrigin(0.5);
    container.add(newHpTxt);
    container.setData('hpText', newHpTxt);

    // Block Badge
    const blockBadge = container.getData('blockBadge');
    if (blockBadge) blockBadge.destroy();
    
    if (enemyData.block > 0) {
      const badgeCont = this.add.container(startX - 8, startY + 3);
      const badgeG = this.add.graphics();
      badgeG.fillStyle(0x00e5ff, 1);
      badgeG.fillRect(-6, -6, 12, 12);
      
      const badgeT = this.add.text(0, 0, enemyData.block.toString(), {
        fontFamily: 'VT323, monospace',
        fontSize: '9px',
        color: '#000000',
        fontWeight: 'bold'
      }).setOrigin(0.5);
      
      badgeCont.add(badgeG);
      badgeCont.add(badgeT);
      container.add(badgeCont);
      container.setData('blockBadge', badgeCont);
    }
  }

  updateEnemyTargetHighlight(container, idx) {
    const targetG = container.getData('targetHighlight');
    if (!targetG || !targetG.active) return;
    targetG.clear();

    const isSelected = this.selectedTargetIndex === idx;
    if (isSelected) {
      const width = container.getData('hitW') || 100;
      const height = container.getData('hitH') || 100;
      
      targetG.lineStyle(2, 0xff3344, 1.0);
      
      // Draw neon corner brackets
      const size = 12;
      const halfW = width / 2 + 4;
      const halfH = height / 2 + 4;
      
      // Top Left
      targetG.lineBetween(-halfW, -halfH + size, -halfW, -halfH);
      targetG.lineBetween(-halfW, -halfH, -halfW + size, -halfH);
      
      // Top Right
      targetG.lineBetween(halfW - size, -halfH, halfW, -halfH);
      targetG.lineBetween(halfW, -halfH, halfW, -halfH + size);
      
      // Bottom Left
      targetG.lineBetween(-halfW, halfH - size, -halfW, halfH);
      targetG.lineBetween(-halfW, halfH, -halfW + size, halfH);
      
      // Bottom Right
      targetG.lineBetween(halfW - size, halfH, halfW, halfH);
      targetG.lineBetween(halfW, halfH - size, halfW, halfH);

      // Create/start pulsing tween
      if (!container.getData('targetTween')) {
        const tween = this.tweens.add({
          targets: targetG,
          alpha: 0.35,
          duration: 500,
          yoyo: true,
          repeat: -1
        });
        container.setData('targetTween', tween);
      }
    } else {
      const tween = container.getData('targetTween');
      if (tween) {
        tween.remove();
        container.setData('targetTween', null);
      }
      targetG.alpha = 1.0;
    }
  }

  setupEventBusListeners() {
    // We store event listeners in this.eventListeners array so we can safely tear them down
    let lastActingEnemyId = null;
    
    // 1. Damage event listener (projectiles + floating texts)
    const onDamage = (event) => {
      const isPlayer = event.target === 'player';
      const isCaitStrike = event.source === 'cait';
      const amount = Math.round(event.amount);
      if (amount <= 0) return;

      let targetX = 180;
      let targetY = 150;

      if (!isPlayer) {
        const sprite = this.enemySprites.find(s => s.getData('enemyId') === event.targetId) || this.enemySprites[0];
        if (sprite) {
          targetX = sprite.x;
          targetY = sprite.y;
          if (isCaitStrike) {
            const delay = 600 + Math.max(0, Number(event.actionIndex ?? 0)) * 180;
            this.time.delayedCall(delay, () => {
              if (sprite.active) {
                this.tweens.add({
                  targets: sprite,
                  x: targetX + 8,
                  duration: 50,
                  yoyo: true,
                  repeat: 3,
                  onComplete: () => { if (sprite.active) sprite.x = targetX; }
                });
              }
              this.spawnFloatingNumber(targetX, targetY - 40, `-${amount}`, event.crit ? '#ff66ff' : '#00e5ff');
              this.cameras.main.flash(70, 60, 0, 90, 0.1);
            });
            return;
          }
          // Shake target
          this.tweens.add({
            targets: sprite,
            x: targetX + 8,
            duration: 50,
            yoyo: true,
            repeat: 3,
            onComplete: () => { sprite.x = targetX; }
          });
        }
      } else {
        // Shake player
        this.tweens.add({
          targets: this.heroSprite,
          x: 180 + 8,
          duration: 50,
          yoyo: true,
          repeat: 3,
          onComplete: () => { this.heroSprite.x = 180; }
        });
      }

      // Draw neon laser projectile from attacker
      if (!isPlayer) {
        // Hero attack
        this.spawnLaserBeam(180, 150, targetX, targetY, 0x00e5ff);
      } else {
        // Enemy attack
        const sprite = this.enemySprites.find(s => s.getData('enemyId') === lastActingEnemyId) || this.enemySprites[0];
        if (sprite?.getData('isBudder')) {
          this.spawnBudderAttackVortex(sprite.x, sprite.y, 180, 150);
        } else if (sprite) {
          this.spawnLaserBeam(sprite.x, sprite.y, 180, 150, 0xff3344);
        }
      }

      // Spawn floating numbers
      this.spawnFloatingNumber(targetX, targetY - 40, `-${amount}`, isPlayer ? '#ff3344' : '#00e5ff');
      
      // Flash screen red/cyan
      this.cameras.main.flash(80, isPlayer ? 100 : 0, isPlayer ? 0 : 100, isPlayer ? 0 : 100, 0.15);
    };

    const onCaitAttackWindup = (event) => {
      this.spawnCaitMomentumBlackHole(event);
    };

    // 2. Combat update listener
    const onCombatUpdate = () => {
      this.updateHeroHp();
      
      // Update each enemy
      const state = this.gameRef?.state;
      if (state && state.enemies) {
        // If enemy count changes, redraw them
        if (state.enemies.length !== this.enemySprites.length) {
          this.createEnemies();
          // Update highlights since layout regenerated
          this.enemySprites.forEach((sprite, idx) => {
            this.updateEnemyTargetHighlight(sprite, idx);
          });
        } else {
          this.enemySprites.forEach((sprite, idx) => {
            const enemyData = state.enemies[idx];
            if (enemyData) this.updateEnemyHp(sprite, enemyData);
          });
        }
      }
    };

    // 3. Enemy Action FX
    const onEnemyAction = ({ enemy, action }) => {
      lastActingEnemyId = enemy.id;
      // Find matching enemy container
      const sprite = this.enemySprites.find(s => s.getData('enemyId') === enemy.id);
      if (sprite) {
        // Charge attack forward animation
        const originalX = sprite.x;
        this.tweens.add({
          targets: sprite,
          x: originalX - 40,
          duration: 150,
          yoyo: true,
          ease: 'Power2',
          onComplete: () => { sprite.x = originalX; }
        });

      }
    };

    const onCardPlayed = ({ card, targetIndex }) => {
      if (this.isAsiphyxGravityCard(card)) {
        this.spawnAsiphyxGravityPull(targetIndex);
      }
    };

    const onToast = ({ text }) => {
      const message = String(text ?? '');
      if (message.includes('Cait momentum') || message.includes('Center of Gravity')) {
        this.spawnAsiphyxGravityPull(this.selectedTargetIndex ?? 0);
      }
    };

    // 4. Target selection changed listener
    const onTargetChanged = (index) => {
      this.selectedTargetIndex = index;
      this.enemySprites.forEach((sprite, idx) => {
        this.updateEnemyTargetHighlight(sprite, idx);
      });
    };

    // Bind and save references
    this.eventListeners.push(bus.on('damageDealt', onDamage));
    this.eventListeners.push(bus.on('caitAttackWindup', onCaitAttackWindup));
    this.eventListeners.push(bus.on('combatUpdate', onCombatUpdate));
    this.eventListeners.push(bus.on('enemyAction', onEnemyAction));
    this.eventListeners.push(bus.on('cardPlayed', onCardPlayed));
    this.eventListeners.push(bus.on('toast', onToast));
    this.eventListeners.push(bus.on('targetChanged', onTargetChanged));
    
    // Bind window resize
    const onResize = () => {
      if (this.scale) this.scale.resize(window.innerWidth, this.scale.height);
    };
    window.addEventListener('resize', onResize);
    this.eventListeners.push(() => window.removeEventListener('resize', onResize));
  }

  spawnLaserBeam(fromX, fromY, toX, toY, color) {
    const line = this.add.graphics();
    line.lineStyle(4, color, 1);
    line.lineBetween(fromX, fromY, toX, toY);
    line.setDepth(10);

    // Laser fading particle line
    this.tweens.add({
      targets: line,
      alpha: 0,
      width: 0,
      duration: 250,
      onComplete: () => line.destroy()
    });

    // Spawn sparks at target
    const sparks = this.add.graphics();
    sparks.fillStyle(color, 0.9);
    sparks.setDepth(11);
    
    for (let i = 0; i < 8; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = Math.random() * 80 + 30;
      const particle = {
        x: toX,
        y: toY,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed
      };
      
      this.tweens.add({
        targets: particle,
        x: toX + particle.vx * 0.4,
        y: toY + particle.vy * 0.4,
        duration: 300,
        ease: 'Cubic.easeOut',
        onUpdate: () => {
          if (!sparks.active) return;
          sparks.fillRect(particle.x - 2, particle.y - 2, 4, 4);
        }
      });
    }

    this.time.delayedCall(320, () => sparks.destroy());
  }

  spawnCaitMomentumBlackHole(event = {}) {
    if (this.gameRef?.state?.hero?.id !== 'asiphyx') return;

    const actionIndex = Math.max(0, Number(event.actionIndex ?? 0));
    const startDelay = actionIndex * 260;
    const target = this.enemySprites.find(sprite => sprite.getData('enemyId') === event.targetId)
      ?? this.enemySprites[event.targetIndex]
      ?? this.enemySprites[0];
    if (!target) return;

    const sourceX = (this.heroSprite?.x ?? 180) + 16;
    const sourceY = (this.heroSprite?.y ?? 150) + 58;
    const targetX = target.x;
    const targetY = target.y;
    const holeX = Phaser.Math.Linear(sourceX, targetX, 0.82);
    const holeY = Phaser.Math.Linear(sourceY, targetY, 0.72) - 22;
    const strikeAngle = Phaser.Math.RadToDeg(Math.atan2(holeY - sourceY, holeX - sourceX));

    this.time.delayedCall(startDelay, () => {
      const hole = this.add.container(holeX, holeY);
      hole.setDepth(18);

      const shadow = this.add.circle(0, 0, 24, 0x000000, 1);
      shadow.setStrokeStyle(3, event.crit ? 0xff66ff : 0x66fff0, 0.96);
      shadow.setBlendMode('MULTIPLY');
      hole.add(shadow);

      const eventHorizon = this.add.circle(0, 0, 34, 0x000000, 0);
      eventHorizon.setStrokeStyle(4, 0xff4fa8, 0.92);
      eventHorizon.setBlendMode('ADD');
      hole.add(eventHorizon);

      const accretion = this.add.ellipse(0, 0, 78, 24);
      accretion.setStrokeStyle(3, 0x66fff0, 0.88);
      accretion.setAngle(strikeAngle);
      accretion.setBlendMode('ADD');
      hole.add(accretion);

      const inner = this.add.ellipse(0, 0, 46, 16);
      inner.setStrokeStyle(2, 0xffffff, 0.72);
      inner.setAngle(strikeAngle + 14);
      inner.setBlendMode('ADD');
      hole.add(inner);

      this.tweens.add({
        targets: hole,
        scale: 1.18,
        angle: event.crit ? -44 : -28,
        duration: 240,
        ease: 'Back.out',
        onComplete: () => {
          this.tweens.add({
            targets: hole,
            angle: hole.angle - 220,
            scale: 0.78,
            alpha: 0,
            delay: 520,
            duration: 320,
            ease: 'Cubic.easeIn',
            onComplete: () => hole.destroy()
          });
        }
      });

      for (let i = 0; i < 22; i++) {
        const t = i / 21;
        const particle = this.add.circle(
          Phaser.Math.Linear(sourceX, holeX, t * 0.56) + Math.sin(i * 1.7) * 18,
          Phaser.Math.Linear(sourceY, holeY, t * 0.56) + Math.cos(i * 1.3) * 14,
          i % 4 === 0 ? 2.8 : 1.7,
          i % 2 === 0 ? 0x66fff0 : 0xff4fa8,
          0.78
        );
        particle.setDepth(17);
        particle.setBlendMode('ADD');
        this.tweens.add({
          targets: particle,
          x: holeX + Math.cos(i) * 4,
          y: holeY + Math.sin(i) * 4,
          scale: 0.25,
          alpha: 0,
          duration: 310 + (i % 5) * 38,
          delay: i * 12,
          ease: 'Cubic.easeIn',
          onComplete: () => particle.destroy()
        });
      }

      const pullLine = this.add.graphics();
      pullLine.setDepth(16);
      pullLine.setBlendMode('ADD');
      pullLine.lineStyle(5, 0xff4fa8, 0.42);
      pullLine.lineBetween(sourceX, sourceY, holeX, holeY);
      pullLine.lineStyle(2, 0x66fff0, 0.86);
      pullLine.lineBetween(sourceX + 12, sourceY - 8, holeX - 10, holeY + 8);
      this.tweens.add({
        targets: pullLine,
        alpha: 0,
        duration: 620,
        ease: 'Quad.out',
        onComplete: () => pullLine.destroy()
      });

      const caitVector = this.add.container(sourceX, sourceY);
      caitVector.setDepth(19);
      const caitCore = this.add.ellipse(0, 0, 34, 22, 0xff4fa8, 0.76);
      caitCore.setStrokeStyle(2, 0xffffff, 0.82);
      caitCore.setBlendMode('ADD');
      const caitText = this.add.text(0, 0, 'C', {
        fontFamily: 'Press Start 2P, monospace',
        fontSize: '12px',
        color: '#ffffff',
        stroke: '#ff4fa8',
        strokeThickness: 3,
      }).setOrigin(0.5);
      caitVector.add([caitCore, caitText]);

      this.tweens.add({
        targets: caitVector,
        x: holeX,
        y: holeY,
        angle: strikeAngle + 720,
        scaleX: 0.62,
        scaleY: 1.28,
        duration: 360,
        delay: 170,
        ease: 'Cubic.easeIn',
        onComplete: () => {
          this.spawnCaitMomentumImpact(holeX, holeY, targetX, targetY, event.crit);
          this.tweens.add({
            targets: caitVector,
            x: sourceX,
            y: sourceY,
            angle: strikeAngle + 1080,
            scaleX: 1,
            scaleY: 1,
            alpha: 0,
            duration: 320,
            ease: 'Cubic.easeOut',
            onComplete: () => caitVector.destroy()
          });
        }
      });
    });
  }

  spawnCaitMomentumImpact(holeX, holeY, targetX, targetY, crit = false) {
    const color = crit ? 0xff66ff : 0x66fff0;
    const slash = this.add.graphics();
    slash.setDepth(20);
    slash.setBlendMode('ADD');
    slash.lineStyle(8, color, 0.96);
    slash.lineBetween(holeX, holeY, targetX, targetY);
    slash.lineStyle(2, 0xffffff, 0.9);
    slash.lineBetween(holeX - 10, holeY + 12, targetX + 10, targetY - 12);
    this.tweens.add({
      targets: slash,
      alpha: 0,
      duration: 260,
      ease: 'Quad.out',
      onComplete: () => slash.destroy()
    });

    for (let i = 0; i < 4; i++) {
      const ring = this.add.ellipse(targetX, targetY, 32 + i * 14, 16 + i * 7);
      ring.setStrokeStyle(2, i % 2 === 0 ? color : 0xff4fa8, 0.72);
      ring.setAngle(-16 + i * 13);
      ring.setDepth(20);
      ring.setBlendMode('ADD');
      this.tweens.add({
        targets: ring,
        scaleX: 1.9,
        scaleY: 1.45,
        alpha: 0,
        duration: 340 + i * 60,
        ease: 'Quad.out',
        onComplete: () => ring.destroy()
      });
    }
  }

  isAsiphyxGravityCard(card) {
    if (this.gameRef?.state?.hero?.id !== 'asiphyx') return false;
    if (!card) return false;
    const tags = card.tags ?? [];
    const effectTypes = (card.effects ?? []).map(effect => effect.type);
    return tags.includes('gravity')
      || tags.includes('cait')
      || effectTypes.includes('cait_extra_action')
      || effectTypes.includes('mark_target_crit')
      || card.id === 'cait_momentum';
  }

  spawnAsiphyxGravityPull(targetIndex = 0) {
    const tealReady = this.ensureSheetAnimation(ASIPHYX_PULL_TEAL_TEXTURE, `${ASIPHYX_PULL_TEAL_TEXTURE}_loop`, 20);
    const redReady = this.ensureSheetAnimation(ASIPHYX_PULL_RED_TEXTURE, `${ASIPHYX_PULL_RED_TEXTURE}_loop`, 18);
    if (!tealReady && !redReady) return;

    const heroX = this.heroSprite?.x ?? 180;
    const heroY = this.heroSprite?.y ?? 150;
    const target = this.enemySprites[targetIndex] ?? this.enemySprites[0];
    const targetX = target?.x ?? heroX + 250;
    const targetY = target?.y ?? heroY;
    const angle = Phaser.Math.RadToDeg(Math.atan2(targetY - heroY, targetX - heroX));
    const pullLen = Phaser.Math.Distance.Between(heroX, heroY, targetX, targetY);

    const field = this.add.graphics();
    field.setDepth(13);
    field.setBlendMode('ADD');
    field.lineStyle(3, 0x66fff0, 0.16);
    field.lineBetween(heroX, heroY - 44, targetX, targetY - 24);
    field.lineStyle(2, 0xff4fa8, 0.13);
    field.lineBetween(heroX, heroY + 44, targetX, targetY + 24);
    field.lineStyle(1, 0xffffff, 0.075);
    field.lineBetween(heroX + 18, heroY, targetX - 18, targetY);
    this.tweens.add({
      targets: field,
      alpha: 0,
      duration: 980,
      ease: 'Quad.out',
      onComplete: () => field.destroy()
    });

    const ring = this.add.ellipse(heroX, heroY, 46, 24);
    ring.setStrokeStyle(2, 0x66fff0, 0.24);
    ring.setBlendMode('ADD');
    ring.setDepth(13);
    this.tweens.add({
      targets: ring,
      scaleX: 2.4,
      scaleY: 1.7,
      alpha: 0,
      duration: 720,
      ease: 'Quad.out',
      onComplete: () => ring.destroy()
    });

    const targetRing = this.add.ellipse(targetX, targetY, 54, 28);
    targetRing.setStrokeStyle(2, 0xff4fa8, 0.21);
    targetRing.setBlendMode('ADD');
    targetRing.setDepth(13);
    this.tweens.add({
      targets: targetRing,
      scaleX: 2.1,
      scaleY: 1.45,
      alpha: 0,
      duration: 760,
      ease: 'Quad.out',
      onComplete: () => targetRing.destroy()
    });

    const spawnVector = (texture, anim, offsetY, delay, reverse = false, startFrame = 0) => {
      const vector = this.add.sprite(heroX, heroY + offsetY, texture);
      vector.play({ key: anim, startFrame });
      vector.setDisplaySize(Math.min(430, Math.max(220, pullLen * 0.72)), 58);
      vector.setAngle(angle);
      vector.setAlpha(0);
      vector.setBlendMode('ADD');
      vector.setDepth(14);
      vector.setFlipX(reverse);

      this.tweens.add({
        targets: vector,
        x: heroX + (targetX - heroX) * (reverse ? 0.34 : 0.58),
        y: heroY + (targetY - heroY) * (reverse ? 0.34 : 0.58) + offsetY,
        alpha: 0.32,
        duration: 220,
        delay,
        ease: 'Quad.out',
        onComplete: () => {
          this.tweens.add({
            targets: vector,
            x: reverse ? heroX : targetX,
            y: (reverse ? heroY : targetY) + offsetY,
            alpha: 0,
            duration: 690,
            ease: 'Cubic.easeIn',
            onComplete: () => vector.destroy()
          });
        }
      });
    };

    if (tealReady) spawnVector(ASIPHYX_PULL_TEAL_TEXTURE, `${ASIPHYX_PULL_TEAL_TEXTURE}_loop`, -38, 0, false, 3);
    if (redReady) spawnVector(ASIPHYX_PULL_RED_TEXTURE, `${ASIPHYX_PULL_RED_TEXTURE}_loop`, 34, 130, true, 8);
    this.spawnAsiphyxGravitySparks(heroX, heroY, targetX, targetY, angle);
  }

  spawnAsiphyxGravitySparks(heroX, heroY, targetX, targetY, angle) {
    for (let i = 0; i < 14; i++) {
      const t = 0.08 + i * 0.065;
      const color = i % 2 === 0 ? 0x66fff0 : 0xff4fa8;
      const spark = this.add.circle(
        Phaser.Math.Linear(heroX, targetX, t),
        Phaser.Math.Linear(heroY, targetY, t) + Math.sin(i * 1.7) * 34,
        i % 3 === 0 ? 2.4 : 1.5,
        color,
        0.22
      );
      spark.setBlendMode('ADD');
      spark.setDepth(15);

      this.tweens.add({
        targets: spark,
        x: Phaser.Math.Linear(heroX, targetX, Math.min(1, t + 0.18)),
        y: Phaser.Math.Linear(heroY, targetY, Math.min(1, t + 0.18)) - Math.sin(i * 1.2) * 22,
        scale: 2.2,
        alpha: 0,
        duration: 520 + i * 28,
        delay: i * 18,
        ease: 'Quad.out',
        onComplete: () => spark.destroy()
      });

      const wake = this.add.rectangle(spark.x, spark.y, 18, 1, color, 0.12);
      wake.setAngle(angle + (i % 2 === 0 ? -8 : 8));
      wake.setBlendMode('ADD');
      wake.setDepth(14);
      this.tweens.add({
        targets: wake,
        x: spark.x + Math.cos(Phaser.Math.DegToRad(angle)) * 60,
        y: spark.y + Math.sin(Phaser.Math.DegToRad(angle)) * 28,
        alpha: 0,
        scaleX: 0.35,
        duration: 420 + i * 20,
        delay: i * 20,
        ease: 'Quad.out',
        onComplete: () => wake.destroy()
      });
    }
  }

  spawnBudderAttackVortex(fromX, fromY, toX, toY) {
    if (!this.ensureSheetAnimation(BUDDER_VORTEX_TEXTURE, `${BUDDER_VORTEX_TEXTURE}_loop`, 22)) return;

    const trail = this.add.graphics();
    trail.setDepth(11);
    trail.setBlendMode('ADD');
    trail.lineStyle(9, 0xff66e8, 0.42);
    trail.lineBetween(fromX, fromY - 8, toX, toY);
    trail.lineStyle(3, 0x66f7ff, 0.78);
    trail.lineBetween(fromX - 10, fromY + 10, toX + 12, toY - 10);
    trail.lineStyle(2, 0xffffff, 0.52);
    trail.lineBetween(fromX + 8, fromY - 22, toX - 8, toY + 8);

    this.tweens.add({
      targets: trail,
      alpha: 0,
      duration: 1500,
      ease: 'Quad.out',
      onComplete: () => trail.destroy()
    });

    const projectile = this.add.sprite(fromX, fromY - 8, BUDDER_VORTEX_TEXTURE);
    projectile.play(`${BUDDER_VORTEX_TEXTURE}_loop`);
    projectile.setDisplaySize(112, 112);
    projectile.setAlpha(0.95);
    projectile.setBlendMode('ADD');
    projectile.setDepth(12);

    this.tweens.add({
      targets: projectile,
      x: toX,
      y: toY,
      angle: 540,
      scaleX: 1.7,
      scaleY: 0.74,
      alpha: 0.08,
      duration: 1200,
      ease: 'Cubic.easeIn',
      onComplete: () => projectile.destroy()
    });

    for (let i = 0; i < 3; i++) {
      const ring = this.add.ellipse(toX, toY, 36 + i * 18, 18 + i * 8);
      ring.setStrokeStyle(2, i % 2 === 0 ? 0x66f7ff : 0xff66e8, 0.4);
      ring.setBlendMode('ADD');
      ring.setDepth(13);
      this.tweens.add({
        targets: ring,
        scaleX: 2.1,
        scaleY: 1.6,
        alpha: 0,
        duration: 420 + i * 90,
        ease: 'Quad.out',
        onComplete: () => ring.destroy()
      });
    }
  }

  spawnFloatingNumber(x, y, text, colorStr) {
    const floatTxt = this.add.text(x, y, text, {
      fontFamily: 'VT323, monospace',
      fontSize: '28px',
      color: colorStr,
      fontWeight: 'bold',
      stroke: '#000000',
      strokeThickness: 3
    }).setOrigin(0.5);
    
    floatTxt.setDepth(15);

    this.tweens.add({
      targets: floatTxt,
      y: y - 50,
      alpha: 0,
      ease: 'Cubic.easeOut',
      duration: 1000,
      onComplete: () => floatTxt.destroy()
    });
  }

  shutdown() {
    // Tear down listeners to prevent memory leaks
    this.eventListeners.forEach(unsubscribe => unsubscribe());
    this.eventListeners = [];
  }
}
