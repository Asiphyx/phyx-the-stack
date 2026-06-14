import Phaser from 'phaser';
import bus from '../engine/EventBus.js';

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
          const isBudder = enemy.id === 'budder_sphinx';
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
  }

  create() {
    const width = this.scale.width;
    const height = this.scale.height;

    // ─── 1. Background Grid ───
    this.createGridBackground(width, height);

    // ─── 2. Draw Hero Sprite ───
    this.createHero();

    // ─── 3. Draw Enemies ───
    this.createEnemies();

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
    
    // Add matrix debug lines scroll in the top half
    this.matrixText = this.add.text(30, 20, '', {
      fontFamily: 'Share Tech Mono, monospace',
      fontSize: '11px',
      color: '#00e5ff',
      alpha: 0.15
    });
    
    this.updateMatrixText();
    this.time.addEvent({
      delay: 2000,
      callback: () => this.updateMatrixText(),
      loop: true
    });
  }

  updateMatrixText() {
    if (!this.matrixText || !this.matrixText.active) return;
    const logs = [
      `SYS_PHASER_CORE // INITIALIZED`,
      `RENDERER_MODE  // WebGL_STABLE`,
      `HEAP_ALLOCATED // ${Math.floor(Math.random() * 400) + 120}KB`,
      `SHADERS_READY  // PASSIVE`,
      `TICK_CLOCK     // 0x${Math.floor(this.time.now).toString(16).toUpperCase()}`
    ];
    this.matrixText.setText(logs.join('\n'));
  }

  createHero() {
    const state = this.gameRef?.state;
    const hero = state?.hero;
    if (!hero) return;

    // Platform glow using concentric ellipses for smooth blur fade
    this.heroGlow = this.add.container(180, 220);
    const glowColor = Phaser.Display.Color.HexStringToColor(hero.color || '#9933ff').color;
    for (let i = 0; i < 5; i++) {
      const alpha = 0.35 * (1 - i / 5);
      const w = 110 + i * 8;
      const h = 18 + i * 2;
      const ellipse = this.add.ellipse(0, 0, w, h, glowColor, alpha);
      this.heroGlow.add(ellipse);
    }

    // Create container for hero sprite + mask
    this.heroSprite = this.add.container(180, 150);

    // Frame Border
    const border = this.add.graphics();
    border.lineStyle(3, Phaser.Display.Color.HexStringToColor(hero.color).color, 0.9);
    border.fillStyle(0x0f0a1c, 0.85);
    
    // Angled pixel shape frame
    const points = [
      { x: -50, y: -65 }, { x: 35, y: -65 }, { x: 50, y: -50 },
      { x: 50, y: 55 }, { x: -35, y: 55 }, { x: -50, y: 40 }
    ];
    border.beginPath();
    border.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) border.lineTo(points[i].x, points[i].y);
    border.closePath();
    border.fillPath();
    border.strokePath();

    this.heroSprite.add(border);

    // Hero portrait image inside container
    const imgKey = `hero_${hero.id}`;
    if (this.textures.exists(imgKey)) {
      const portrait = this.add.image(0, -5, imgKey);
      portrait.setDisplaySize(90, 90);
      
      // Masking image to stay inside frame boundaries
      const maskGraphics = this.add.graphics();
      maskGraphics.fillStyle(0xffffff, 1);
      maskGraphics.beginPath();
      maskGraphics.moveTo(this.heroSprite.x - 47, this.heroSprite.y - 62);
      maskGraphics.lineTo(this.heroSprite.x + 32, this.heroSprite.y - 62);
      maskGraphics.lineTo(this.heroSprite.x + 47, this.heroSprite.y - 47);
      maskGraphics.lineTo(this.heroSprite.x + 47, this.heroSprite.y + 52);
      maskGraphics.lineTo(this.heroSprite.x - 32, this.heroSprite.y + 52);
      maskGraphics.lineTo(this.heroSprite.x - 47, this.heroSprite.y + 37);
      maskGraphics.closePath();
      maskGraphics.fillPath();
      
      const mask = maskGraphics.createGeometryMask();
      portrait.setMask(mask);
      this.heroSprite.add(portrait);
    } else {
      // Fallback text
      const nameTxt = this.add.text(0, -10, hero.name[0], {
        fontFamily: 'VT323, monospace',
        fontSize: '48px',
        color: '#fff'
      }).setOrigin(0.5);
      this.heroSprite.add(nameTxt);
    }

    // Hero ready tag under platform
    const tagBg = this.add.graphics();
    tagBg.fillStyle(0x000000, 0.8);
    tagBg.lineStyle(1, Phaser.Display.Color.HexStringToColor(hero.color).color, 0.6);
    tagBg.fillRectShape(new Phaser.Geom.Rectangle(-45, 62, 90, 16));
    tagBg.strokeRectShape(new Phaser.Geom.Rectangle(-45, 62, 90, 16));
    this.heroSprite.add(tagBg);

    const tagTxt = this.add.text(0, 70, `${hero.name.toUpperCase()} : ACTIVE`, {
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

      // Custom background body based on type (normal, elite, boss)
      const borderG = this.add.graphics();
      let borderCol = 0x505070;
      let lineThick = 2;

      if (enemy.type === 'boss') {
        borderCol = 0xff3344;
        lineThick = 4;
      } else if (enemy.type === 'elite') {
        borderCol = 0x9933ff;
        lineThick = 3;
      }

      borderG.fillStyle(0x08050e, 0.95);
      borderG.lineStyle(lineThick, borderCol, 0.9);
      
      const widthBox = enemy.type === 'boss' ? 120 : 96;
      const heightBox = enemy.type === 'boss' ? 120 : 96;
      const rect = new Phaser.Geom.Rectangle(-widthBox/2, -heightBox/2, widthBox, heightBox);
      borderG.fillRectShape(rect);
      borderG.strokeRectShape(rect);
      container.add(borderG);

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
            frameRate: 6,
            repeat: -1
          });
        }
        
        spriteObj = this.add.sprite(0, -10, `enemy_idle_${enemy.id}`);
        spriteObj.play(animKey);
      } else if (hasStatic) {
        spriteObj = this.add.image(0, -10, `enemy_static_${enemy.id}`);
      }

      if (spriteObj) {
        const displayW = enemy.type === 'boss' ? 104 : 80;
        const displayH = enemy.type === 'boss' ? 104 : 80;
        spriteObj.setDisplaySize(displayW, displayH);
        container.add(spriteObj);
      } else {
        // Fallback text
        const emojiTxt = this.add.text(0, -10, enemy.emoji ?? '👾', {
          fontSize: enemy.type === 'boss' ? '64px' : '48px',
        }).setOrigin(0.5);
        container.add(emojiTxt);
      }

      // Target Highlight graphics
      const targetG = this.add.graphics();
      container.add(targetG);
      container.setData('targetHighlight', targetG);

      // Enemy Name
      const nameTxt = this.add.text(0, heightBox/2 - 18, enemy.name.toUpperCase(), {
        fontFamily: 'Press Start 2P, monospace',
        fontSize: '5px',
        color: '#00e5ff'
      }).setOrigin(0.5);
      container.add(nameTxt);

      // HP Bar & Block
      const hpG = this.add.graphics();
      container.add(hpG);
      container.setData('hpBar', hpG);

      this.updateEnemyHp(container, enemy);

      // Hover / Click interaction
      borderG.setInteractive(rect, Phaser.Geom.Rectangle.Contains);
      borderG.on('pointerdown', () => {
        bus.emit('toast', { text: `Targeted: ${enemy.name}`, type: 'info' });
        const selectedEvt = new CustomEvent('phaserSelectTarget', { detail: { index: idx } });
        window.dispatchEvent(selectedEvt);
      });

      // Simple hover scale effect
      borderG.on('pointerover', () => {
        container.setScale(1.05);
        borderG.alpha = 1.0;
      });
      borderG.on('pointerout', () => {
        container.setScale(1.0);
      });

      this.add.existing(container);
      this.enemySprites.push(container);
    });
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
      const enemyId = container.getData('enemyId');
      const state = this.gameRef?.state;
      const enemy = state?.enemies?.find(e => e.id === enemyId);
      const width = enemy?.type === 'boss' ? 120 : 96;
      const height = enemy?.type === 'boss' ? 120 : 96;
      
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
      const amount = Math.round(event.amount);
      if (amount <= 0) return;

      let targetX = 180;
      let targetY = 150;

      if (!isPlayer) {
        const sprite = this.enemySprites.find(s => s.getData('enemyId') === event.targetId) || this.enemySprites[0];
        if (sprite) {
          targetX = sprite.x;
          targetY = sprite.y;
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
        if (sprite) {
          this.spawnLaserBeam(sprite.x, sprite.y, 180, 150, 0xff3344);
        }
      }

      // Spawn floating numbers
      this.spawnFloatingNumber(targetX, targetY - 40, `-${amount}`, isPlayer ? '#ff3344' : '#00e5ff');
      
      // Flash screen red/cyan
      this.cameras.main.flash(80, isPlayer ? 100 : 0, isPlayer ? 0 : 100, isPlayer ? 0 : 100, 0.15);
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

    // 4. Target selection changed listener
    const onTargetChanged = (index) => {
      this.selectedTargetIndex = index;
      this.enemySprites.forEach((sprite, idx) => {
        this.updateEnemyTargetHighlight(sprite, idx);
      });
    };

    // Bind and save references
    this.eventListeners.push(bus.on('damageDealt', onDamage));
    this.eventListeners.push(bus.on('combatUpdate', onCombatUpdate));
    this.eventListeners.push(bus.on('enemyAction', onEnemyAction));
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
