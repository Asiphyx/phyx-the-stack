import Phaser from 'phaser';
import { CombatScene } from './CombatScene.js';

let phaserInstance = null;

/**
 * Initializes the Phaser game instance.
 * @param {string} parentContainerId - DOM element ID to mount to
 * @param {object} gameEngine - reference to GameState orchestrator
 */
export function initPhaserGame(parentContainerId, gameEngine) {
  const parent = document.getElementById(parentContainerId);
  if (!parent) {
    console.error(`[PhaserGame] Parent container #${parentContainerId} not found`);
    return null;
  }

  // If an instance already exists, restart the scene with fresh data so preload re-runs
  if (phaserInstance) {
    phaserInstance.scene.stop('CombatScene');
    phaserInstance.scene.start('CombatScene', { game: gameEngine });
    return phaserInstance;
  }

  const config = {
    type: Phaser.CANVAS,
    width: parent.clientWidth || 800,
    height: 300, // Fixed height corresponding to middle battlefield area
    parent: parentContainerId,
    transparent: true, // Transparent background so the grid/vignette CSS background shines through
    pixelArt: true,
    physics: {
      default: 'arcade',
      arcade: {
        debug: false
      }
    },
    scene: [CombatScene],
  };

  phaserInstance = new Phaser.Game(config);
  
  // Start the scene and pass the GameState orchestrator reference
  phaserInstance.scene.start('CombatScene', { game: gameEngine });

  // Handle window resizing dynamically
  const resizeHandler = () => {
    if (phaserInstance && phaserInstance.scale && parent) {
      phaserInstance.scale.resize(parent.clientWidth, 300);
    }
  };
  window.addEventListener('resize', resizeHandler);

  // Store cleanup on game destroy
  const originalDestroy = phaserInstance.destroy;
  phaserInstance.destroy = function(removeCanvas) {
    window.removeEventListener('resize', resizeHandler);
    originalDestroy.call(phaserInstance, removeCanvas);
  };

  return phaserInstance;
}

/**
 * Destroys the current Phaser instance safely.
 */
export function destroyPhaserGame() {
  if (phaserInstance) {
    try {
      phaserInstance.destroy(true);
    } catch (err) {
      console.error('[PhaserGame] Error destroying Phaser instance:', err);
    }
    phaserInstance = null;
  }
}
