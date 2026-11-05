import type { LoadedAssets, LoadedCharacter } from './assets/loader';
import type { AudioManager } from './assets/audio';
import type { GameSnapshot, InputState, Side } from './types';
import { emptyInput } from './types';
import { Fighter } from './entities/fighter';
import { Projectile } from './entities/projectile';
import { BotAI } from './systems/bot';
import { InputManager } from './systems/input';
import { ParticleSystem } from './systems/particles';
import { resolveMeleeHits, resolveProjectileHits, type HitEvent } from './systems/combat';
import { Renderer } from './core/renderer';
import { drawStage, drawFighter, drawProjectiles } from './render/draw';
import { drawHud } from './render/hud';
import { gameFont } from './render/font';
import { clamp } from './core/math';
import {
  CAMERA_LERP,
  FIXED_DT,
  GROUND_Y,
  LOGICAL_W,
  MAX_HP,
  MIN_SEPARATION,
  ROUNDS_TO_WIN,
  ROUND_TIME_SECONDS,
  STAGE_LEFT,
  STAGE_RIGHT,
  WORLD_WIDTH,
} from './constants';
import type { DifficultyKey } from './config/balance';
export interface GameOptions {
  difficulty: DifficultyKey;
  playerCharacter: LoadedCharacter;
  botCharacter: LoadedCharacter;
  onSnapshot: (snapshot: GameSnapshot) => void;
}

type Phase = 'intro' | 'fight' | 'ko' | 'matchEnd';

/** Orkiestrator: petla gry, kamera, rundy, kolizje, renderowanie. */
export class Game {
  private renderer: Renderer;
  private assets: LoadedAssets;
  private audio: AudioManager;
  private input: InputManager;
  private opts: GameOptions;

  private player: Fighter;
  private bot: Fighter;
  private ai: BotAI;
  private projectiles: Projectile[] = [];
  private particles = new ParticleSystem();

  private phase: Phase = 'intro';
  private phaseTimer = 0;
  private koLabel = 'K.O.';
  private timer = ROUND_TIME_SECONDS;
  private wins = { player: 0, bot: 0 };
  private paused = false;

  /** Lewa krawedz widoku w ukladzie swiata. */
  private cameraX = 0;

  private accumulator = 0;
  private lastTime = 0;
  private rafId = 0;
  private running = false;
  private lastSnapshotJson = '';

  constructor(
    renderer: Renderer,
    assets: LoadedAssets,
    audio: AudioManager,
    input: InputManager,
    opts: GameOptions,
  ) {
    this.renderer = renderer;
    this.assets = assets;
    this.audio = audio;
    this.input = input;
    this.opts = opts;
    this.ai = new BotAI(opts.difficulty);

    this.player = new Fighter(opts.playerCharacter.def, opts.playerCharacter, 'player', 420, 1);
    this.bot = new Fighter(opts.botCharacter.def, opts.botCharacter, 'bot', 860, -1);
    this.phase = 'intro';
    this.phaseTimer = 90;
    this.cameraX = this.targetCameraX;
  }

  setDifficulty(difficulty: DifficultyKey): void {
    this.ai.setDifficulty(difficulty);
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.lastTime = performance.now();
    this.accumulator = 0;
    this.rafId = requestAnimationFrame(this.loop);
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.rafId);
  }

  setPaused(paused: boolean): void {
    this.paused = paused;
    if (!paused) this.lastTime = performance.now();
  }

  get isPaused(): boolean {
    return this.paused;
  }

  restartMatch(): void {
    this.wins = { player: 0, bot: 0 };
    this.player.meter = 0;
    this.bot.meter = 0;
    this.resetRound();
    this.phase = 'intro';
    this.phaseTimer = 90;
  }

  private resetRound(): void {
    this.player.resetForRound(420, 1);
    this.bot.resetForRound(860, -1);
    this.projectiles = [];
    this.particles.clear();
    this.timer = ROUND_TIME_SECONDS;
    this.phaseTimer = 0;
    this.cameraX = this.targetCameraX;
  }

  private loop = (time: number): void => {
    if (!this.running) return;
    const elapsed = Math.min(0.25, (time - this.lastTime) / 1000);
    this.lastTime = time;

    if (!this.paused) {
      this.accumulator += elapsed;
      let steps = 0;
      while (this.accumulator >= FIXED_DT && steps < 5) {
        this.step();
        this.accumulator -= FIXED_DT;
        steps++;
      }
      if (steps === 5) this.accumulator = 0;
    }

    this.render();
    this.emitSnapshot();
    this.rafId = requestAnimationFrame(this.loop);
  };

  // ------------------------------------------------------------ symulacja

  private step(): void {
    this.input.update();

    switch (this.phase) {
      case 'intro':
        this.phaseTimer--;
        if (this.phaseTimer <= 0) {
          this.phase = 'fight';
        }
        this.updateFighters(emptyInput(), {
          up: false,
          light: false,
          heavy: false,
          special: false,
        });
        break;

      case 'fight':
        this.timer -= FIXED_DT;
        if (this.timer <= 0) {
          this.timer = 0;
          this.endRound(this.player.hp >= this.bot.hp ? 'player' : 'bot', 'CZAS');
          break;
        }
        this.updateFighters(this.input.state, this.input.edges);
        break;

      case 'ko':
        this.phaseTimer--;
        this.updateFighters(emptyInput(), {
          up: false,
          light: false,
          heavy: false,
          special: false,
        });
        if (this.phaseTimer <= 0) this.advanceAfterRound();
        break;

      case 'matchEnd':
        this.updateFighters(emptyInput(), {
          up: false,
          light: false,
          heavy: false,
          special: false,
        });
        break;

      default:
        break;
    }

    this.particles.update();
    this.updateCamera();
  }

  /** Kamera wysrodkowuje walke i nie wyjezdza poza granice swiata. */
  private get targetCameraX(): number {
    const mid = (this.player.x + this.bot.x) / 2;
    return clamp(mid - LOGICAL_W / 2, 0, WORLD_WIDTH - LOGICAL_W);
  }

  private updateCamera(): void {
    const target = this.targetCameraX;
    this.cameraX += (target - this.cameraX) * CAMERA_LERP;
    if (Math.abs(target - this.cameraX) < 0.4) this.cameraX = target;
  }

  private updateFighters(
    playerInput: InputState,
    playerEdges: { up: boolean; light: boolean; heavy: boolean; special: boolean },
  ): void {
    const botInput = this.ai.update(this.bot, this.player, this.projectiles);
    const botEdges = this.ai.edges;

    this.player.update(FIXED_DT, playerInput, playerEdges, this.bot.x);
    this.bot.update(FIXED_DT, botInput, botEdges, this.player.x);

    this.handleEvents(this.player);
    this.handleEvents(this.bot);

    if (this.player.pendingProjectile) {
      this.player.pendingProjectile = false;
      this.spawnProjectile(this.player);
    }
    if (this.bot.pendingProjectile) {
      this.bot.pendingProjectile = false;
      this.spawnProjectile(this.bot);
    }

    for (const p of this.projectiles) p.update();
    this.projectiles = this.projectiles.filter(
      (p) => !p.dead && p.x > STAGE_LEFT - 80 && p.x < STAGE_RIGHT + 80,
    );

    const events: HitEvent[] = [];
    resolveMeleeHits(this.player, this.bot, events);
    resolveProjectileHits(this.projectiles, [this.player, this.bot], events);
    this.handleHits(events);

    Fighter.separate(this.player, this.bot, MIN_SEPARATION);

    if (this.phase === 'fight' && (this.player.hp <= 0 || this.bot.hp <= 0)) {
      this.endRound(this.bot.hp <= 0 ? 'player' : 'bot', 'K.O.');
    }
  }

  private handleEvents(f: Fighter): void {
    const ev = f.lastEvents;
    if (ev.jumped) this.audio.play('jump', 0.6);
    if (ev.attackStarted === 'light') this.audio.play('light', 0.7);
    if (ev.attackStarted === 'heavy') this.audio.play('heavy', 0.8);
    if (ev.attackStarted === 'air') this.audio.play('heavy', 0.7);
    if (ev.attackStarted === 'special') this.audio.play('special', 0.8);
  }

  private spawnProjectile(f: Fighter): void {
    const y = f.y - f.def.bodyH * 0.62;
    const x = f.x + f.facing * 34;
    this.projectiles.push(new Projectile(f.side, x, y, f.facing));
  }

  private handleHits(events: HitEvent[]): void {
    for (const ev of events) {
      if (ev.blocked) {
        this.audio.play('block', 0.8);
        this.particles.spawnImpact(ev.x, ev.y, '#9fd8ff', 5, 0.7);
      } else {
        this.audio.play(
          ev.kind === 'heavy' || ev.kind === 'air' || ev.kind === 'projectile' ? 'heavy' : 'hit',
          0.9,
        );
        const color = ev.kind === 'projectile' ? '#ffb066' : '#ff5f5f';
        this.particles.spawnImpact(
          ev.x,
          ev.y,
          color,
          ev.kind === 'light' ? 6 : 12,
          ev.kind === 'light' ? 0.8 : 1.4,
        );
      }
    }
  }

  private endRound(winner: Side, label: string): void {
    if (this.phase !== 'fight') return;
    if (winner === 'player') this.wins.player++;
    else this.wins.bot++;

    this.player.setOutcome(winner === 'player');
    this.bot.setOutcome(winner === 'bot');
    this.phase = 'ko';
    this.phaseTimer = 150;
    this.koLabel = label;
    this.audio.play('ko', 1);
  }

  private advanceAfterRound(): void {
    if (this.wins.player >= ROUNDS_TO_WIN || this.wins.bot >= ROUNDS_TO_WIN) {
      this.phase = 'matchEnd';
      return;
    }
    this.resetRound();
    this.phase = 'intro';
    this.phaseTimer = 90;
  }

  // ------------------------------------------------------------ renderowanie

  private render(): void {
    const r = this.renderer;
    drawStage(r, this.assets.stage, this.cameraX);

    // cienie
    for (const f of [this.player, this.bot]) {
      const scale = clamp(1 - (GROUND_Y - f.y) / 200, 0.4, 1);
      const w = 44 * scale;
      r.fillRect(f.x - w / 2 - this.cameraX, GROUND_Y - 3, w, 4, 'rgba(0,0,0,0.4)');
    }

    this.particles.forEach((x, y, size, color, alpha) => {
      r.ctx.globalAlpha = alpha;
      r.fillRect(x - this.cameraX, y, size, size, color);
      r.ctx.globalAlpha = 1;
    });

    drawProjectiles(r, this.projectiles, this.cameraX);

    // postac blizej kamery rysowana jako druga
    const order = this.player.y <= this.bot.y ? [this.player, this.bot] : [this.bot, this.player];
    for (const f of order) drawFighter(r, f, this.cameraX);

    const message = this.phase === 'intro' ? 'WALCZ!' : this.phase === 'ko' ? this.koLabel : null;

    drawHud(r, {
      player: this.player,
      bot: this.bot,
      timer: this.timer,
      wins: this.wins,
      roundsToWin: ROUNDS_TO_WIN,
      message:
        this.phase === 'matchEnd'
          ? this.wins.player > this.wins.bot
            ? 'ZWYCIESTWO'
            : 'PORAZKA'
          : message,
      subMessage: this.phase === 'matchEnd' ? 'ENTER - rewanż   ESC - menu' : null,
    });

    if (this.paused) {
      r.ctx.fillStyle = 'rgba(6,4,12,0.72)';
      r.ctx.fillRect(0, 0, LOGICAL_W, 360);
      const ctx = r.ctx;
      ctx.font = gameFont(30);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#ffe9a8';
      ctx.fillText('PAUZA', LOGICAL_W / 2, 150);
      ctx.font = gameFont(13);
      ctx.fillStyle = '#cbb8e8';
      ctx.fillText('ESC - wznów', LOGICAL_W / 2, 186);
    }
  }

  private emitSnapshot(): void {
    const snapshot: GameSnapshot = {
      phase:
        this.phase === 'matchEnd'
          ? 'result'
          : this.paused
            ? 'paused'
            : this.phase === 'ko'
              ? 'ko'
              : 'fight',
      winner:
        this.phase === 'matchEnd' ? (this.wins.player > this.wins.bot ? 'player' : 'bot') : null,
      playerHp: Math.round((this.player.hp / MAX_HP) * 100),
      botHp: Math.round((this.bot.hp / MAX_HP) * 100),
      playerMeter: Math.round(this.player.meter),
      botMeter: Math.round(this.bot.meter),
      timer: Math.max(0, Math.ceil(this.timer)),
      round: this.wins.player + this.wins.bot + 1,
      wins: { ...this.wins },
    };
    const json = JSON.stringify(snapshot);
    if (json !== this.lastSnapshotJson) {
      this.lastSnapshotJson = json;
      this.opts.onSnapshot(snapshot);
    }
  }
}
