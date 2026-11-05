import type { Fighter } from '../entities/fighter';
import type { Projectile } from '../entities/projectile';
import type { InputState } from '../types';
import { emptyInput } from '../types';
import { DIFFICULTY, type DifficultyKey } from '../config/balance';
import { chance, randInt } from '../core/math';

type BotAction = 'idle' | 'approach' | 'retreat' | 'attack' | 'block' | 'crouch' | 'jump' | 'special';

/**
 * Bot oparty na automacie stanow.
 *
 * Kazda decyzja podejmowana jest w interwale zaleznym od poziomu trudnosci,
 * a reakcja na pociski jest opozniona o `reaction` klatek - dzieki temu
 * trudniejszy bot nie jest po prostu "szybszy", tylko trafniej decyduje.
 */
export class BotAI {
  private difficulty: DifficultyKey;
  private action: BotAction = 'idle';
  private actionTimer = 0;
  private decisionTimer = 0;
  private input = emptyInput();
  private edgeQueue: { up: boolean; light: boolean; heavy: boolean; special: boolean } = {
    up: false,
    light: false,
    heavy: false,
    special: false,
  };
  /** Kolejka ostatnich klatek - symuluje opoznienie reakcji. */
  private threatHistory: boolean[] = [];

  constructor(difficulty: DifficultyKey) {
    this.difficulty = difficulty;
  }

  setDifficulty(difficulty: DifficultyKey): void {
    this.difficulty = difficulty;
  }

  get currentAction(): BotAction {
    return this.action;
  }

  update(self: Fighter, opponent: Fighter, projectiles: readonly Projectile[]): InputState {
    const cfg = DIFFICULTY[this.difficulty];
    this.input = emptyInput();
    this.edgeQueue = { up: false, light: false, heavy: false, special: false };

    if (!self.canAct || self.isDefeated || opponent.isDefeated) {
      return this.input;
    }

    const distance = Math.abs(opponent.x - self.x);
    const toward = opponent.x > self.x ? 1 : -1;

    // --- reakcja na pociski (z opoznieniem) ---
    const incoming = projectiles.some(
      (p) =>
        p.owner !== self.side &&
        !p.dead &&
        Math.abs(p.y - (self.y - self.def.bodyH / 2)) < 40 &&
        Math.sign(p.vx) === Math.sign(self.x - p.x),
    );
    this.threatHistory.push(incoming);
    if (this.threatHistory.length > cfg.reaction) this.threatHistory.shift();
    const reactedThreat = this.threatHistory[0] === true && incoming;

    if (reactedThreat && chance(cfg.defense)) {
      this.action = 'block';
      this.actionTimer = 22;
      this.input.block = true;
      return this.input;
    }

    this.actionTimer--;
    this.decisionTimer--;

    if (this.decisionTimer <= 0 || this.actionTimer <= 0) {
      this.decide(self, opponent, distance, cfg);
    }

    this.execute(self, opponent, distance, toward);
    return this.input;
  }

  private decide(
    self: Fighter,
    opponent: Fighter,
    distance: number,
    cfg: (typeof DIFFICULTY)[DifficultyKey],
  ): void {
    this.decisionTimer = randInt(8, 22);
    this.actionTimer = randInt(14, 34);

    const opponentAttacking = opponent.isAttacking;
    const opponentAttackPhase = opponent.attackPhase;

    // obrona przed atakiem z bliska
    if (opponentAttacking && distance < 60 && opponentAttackPhase !== 'recovery') {
      if (chance(cfg.defense)) {
        this.action = chance(0.65) ? 'block' : 'retreat';
        return;
      }
    }

    // punish w oknie recovery
    if (opponentAttacking && opponentAttackPhase === 'recovery' && distance < 46) {
      if (chance(cfg.aggression + 0.25)) {
        this.action = 'attack';
        return;
      }
    }

    if (distance > 150) {
      this.action = self.meter >= 25 && chance(0.5) ? 'special' : 'approach';
      return;
    }

    if (distance > 70) {
      const roll = Math.random();
      if (roll < cfg.aggression) this.action = 'approach';
      else if (roll < cfg.aggression + 0.2) this.action = 'special';
      else this.action = 'idle';
      return;
    }

    if (distance > 40) {
      const roll = Math.random();
      if (roll < cfg.aggression) this.action = 'attack';
      else if (roll < cfg.aggression + 0.15) this.action = 'jump';
      else this.action = 'retreat';
      return;
    }

    // bardzo blisko
    const roll = Math.random();
    if (roll < cfg.aggression + 0.2) this.action = 'attack';
    else if (roll < cfg.aggression + 0.35) this.action = 'block';
    else if (roll < cfg.aggression + 0.45) this.action = 'crouch';
    else this.action = 'retreat';
  }

  private execute(self: Fighter, opponent: Fighter, distance: number, toward: number): void {
    const cfg = DIFFICULTY[this.difficulty];

    switch (this.action) {
      case 'approach':
        if (toward > 0) this.input.right = true;
        else this.input.left = true;
        break;

      case 'retreat':
        if (toward > 0) this.input.left = true;
        else this.input.right = true;
        break;

      case 'block':
        this.input.block = true;
        break;

      case 'crouch':
        this.input.down = true;
        break;

      case 'jump':
        this.edgeQueue.up = true;
        if (toward > 0) this.input.right = true;
        else this.input.left = true;
        break;

      case 'special':
        if (self.meter >= 25 && distance > 90) {
          this.edgeQueue.special = true;
          this.action = 'idle';
        } else {
          this.action = 'approach';
        }
        break;

      case 'attack': {
        if (distance < 52) {
          const useHeavy = chance(0.35 + cfg.aggression * 0.2);
          if (useHeavy) this.edgeQueue.heavy = true;
          else this.edgeQueue.light = true;
          if (chance(cfg.comboChance)) this.actionTimer = 6;
          else this.action = 'idle';
        } else {
          if (toward > 0) this.input.right = true;
          else this.input.left = true;
        }
        break;
      }

      case 'idle':
      default:
        // drobne korekty pozycji, zeby bot nie stal jak posag
        if (distance > 90 && chance(0.02)) {
          if (toward > 0) this.input.right = true;
          else this.input.left = true;
        }
        break;
    }

    // unikanie naroznika
    if (self.x < 40 && this.input.left) this.input.left = false;
    if (self.x > 440 && this.input.right) this.input.right = false;

    // losowy blok przy presji przeciwnika
    if (distance < 55 && opponent.isAttacking && chance(0.05 * cfg.defense)) {
      this.input.block = true;
    }
  }

  /** Jednorazowe wcisniecia do przekazania do Fighter.update. */
  get edges(): { up: boolean; light: boolean; heavy: boolean; special: boolean } {
    return this.edgeQueue;
  }
}
