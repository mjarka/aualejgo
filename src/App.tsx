import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactElement } from 'react';
import { CharacterSelect, type SelectResult } from './components/CharacterSelect';
import { LoadingOverlay, PauseOverlay, ResultOverlay } from './components/Overlays';
import { TouchControls } from './components/TouchControls';
import { Game } from './game/Game';
import { Renderer } from './game/core/renderer';
import { InputManager } from './game/systems/input';
import { AudioManager, MUSIC_FILE, SFX_FILES } from './game/assets/audio';
import { ensureGameFont } from './game/render/font';
import { loadAssets, type LoadedAssets } from './game/assets/loader';
import { CHARACTER_LIST } from './game/config/characters';
import { STAGE } from './game/config/stages';
import { DIFFICULTY } from './game/config/balance';
import type { GameSnapshot, InputState } from './game/types';

type Screen = 'select' | 'loading' | 'game';

const AUDIO_FILES = [...Object.values(SFX_FILES), MUSIC_FILE];

const initialSnapshot: GameSnapshot = {
  phase: 'fight',
  winner: null,
  playerHp: 100,
  botHp: 100,
  playerMeter: 0,
  botMeter: 0,
  timer: 60,
  round: 1,
  wins: { player: 0, bot: 0 },
};

const isTouchDevice = (): boolean =>
  typeof window !== 'undefined' &&
  (window.matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window);

const App = (): ReactElement => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<Renderer | null>(null);
  const inputRef = useRef<InputManager | null>(null);
  const audioRef = useRef<AudioManager | null>(null);
  const assetsRef = useRef<LoadedAssets | null>(null);
  const gameRef = useRef<Game | null>(null);

  const [screen, setScreen] = useState<Screen>('select');
  const [selection, setSelection] = useState<SelectResult>({
    player: 'c1',
    bot: 'c2',
    difficulty: 'normal',
  });
  const [snapshot, setSnapshot] = useState<GameSnapshot>(initialSnapshot);
  const [paused, setPaused] = useState(false);
  const [muted, setMuted] = useState(false);
  const [progress, setProgress] = useState({ value: 0, label: 'Przygotowanie...' });
  const [touchMode, setTouchMode] = useState(isTouchDevice);
  const [portraits, setPortraits] = useState<Record<string, CanvasImageSource>>({});

  const difficultyLabel = useMemo(
    () => DIFFICULTY[selection.difficulty].label,
    [selection.difficulty],
  );

  // ------------------------------------------------------------- renderer

  useEffect(() => {
    if (!canvasRef.current) return;
    rendererRef.current = new Renderer(canvasRef.current);
    const input = new InputManager();
    input.attach();
    inputRef.current = input;
    return () => {
      input.detach();
      inputRef.current = null;
    };
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    const renderer = rendererRef.current;
    if (!container || !renderer) return;

    const apply = (): void => {
      renderer.resize(container.clientWidth, container.clientHeight);
    };
    apply();

    // ResizeObserver lapie zmiany rozmiaru kontenera, a listener `resize`
    // dodatkowo obsluguje zmiane rozmiaru okna i obrot ekranu.
    const observer = new ResizeObserver(apply);
    observer.observe(container);
    window.addEventListener('resize', apply);
    window.addEventListener('orientationchange', apply);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', apply);
      window.removeEventListener('orientationchange', apply);
    };
  }, [screen]);

  // ---------------------------------------------------------------- audio

  const ensureAudio = useCallback((): AudioManager => {
    if (!audioRef.current) {
      const Ctor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new Ctor();
      const manager = new AudioManager(ctx);
      manager.setMuted(muted);
      audioRef.current = manager;
    }
    return audioRef.current;
  }, [muted]);

  const toggleMute = useCallback(() => {
    setMuted((prev) => {
      const next = !prev;
      audioRef.current?.setMuted(next);
      return next;
    });
  }, []);

  // -------------------------------------------------------- portrety (wybor)

  useEffect(() => {
    let cancelled = false;
    const load = async (): Promise<void> => {
      const result: Record<string, CanvasImageSource> = {};
      await Promise.all(
        CHARACTER_LIST.map(
          (c) =>
            new Promise<void>((resolve) => {
              const img = new Image();
              img.onload = () => {
                result[c.id] = img;
                resolve();
              };
              img.onerror = () => resolve();
              img.src = c.portrait;
            }),
        ),
      );
      if (!cancelled) setPortraits(result);
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  // -------------------------------------------------------------- rozgrywka

  const startMatch = useCallback(
    async (result: SelectResult) => {
      setSelection(result);
      setScreen('loading');
      setProgress({ value: 0, label: 'Wczytywanie grafik...' });

      const audio = ensureAudio();
      await audio.resume();

      // HUD rysujemy bezposrednio na canvasie - kroj musi byc gotowy zanim
      // ruszy pierwsza klatka, inaczej tekst mrugnie fontem zapasowym.
      await ensureGameFont();

      const assets = await loadAssets(CHARACTER_LIST, STAGE, audio.ctx, AUDIO_FILES, (p) =>
        setProgress({ value: p.total ? p.loaded / p.total : 1, label: p.label }),
      );

      assetsRef.current = assets;
      audio.setBuffers(assets.audio);
      if (assets.configProblems.length > 0) {
        console.warn(
          '[Bijatyka] Problemy z konfiguracja spritesheetow:\n' + assets.configProblems.join('\n'),
        );
      }

      const renderer = rendererRef.current;
      const input = inputRef.current;
      if (!renderer || !input) return;

      const playerLoaded = assets.characters[result.player];
      const botLoaded = assets.characters[result.bot];
      if (!playerLoaded || !botLoaded) {
        console.error('[Bijatyka] Brak wczytanej postaci', result);
        setScreen('select');
        return;
      }

      gameRef.current?.stop();
      const game = new Game(renderer, assets, audio, input, {
        difficulty: result.difficulty,
        playerCharacter: playerLoaded,
        botCharacter: botLoaded,
        onSnapshot: setSnapshot,
      });
      gameRef.current = game;

      if (containerRef.current) {
        renderer.resize(containerRef.current.clientWidth, containerRef.current.clientHeight);
      }

      setPaused(false);
      setScreen('game');
      game.start();
    },
    [ensureAudio],
  );

  const resume = useCallback(() => {
    gameRef.current?.setPaused(false);
    setPaused(false);
    void audioRef.current?.resume();
  }, []);

  const pause = useCallback(() => {
    gameRef.current?.setPaused(true);
    setPaused(true);
  }, []);

  const goToSelect = useCallback(() => {
    gameRef.current?.stop();
    gameRef.current = null;
    audioRef.current?.stopMusic();
    setPaused(false);
    setScreen('select');
  }, []);

  const rematch = useCallback(() => {
    const game = gameRef.current;
    if (!game) {
      void startMatch(selection);
      return;
    }
    game.restartMatch();
    game.setPaused(false);
    setPaused(false);
  }, [selection, startMatch]);

  // ------------------------------------------------------------ klawiatura

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.code === 'Escape') {
        // na ekranie wyniku pauza nie ma sensu - walka jest juz zakonczona
        if (screen !== 'game' || snapshot.phase === 'result') return;
        e.preventDefault();
        if (paused) resume();
        else pause();
        return;
      }
      if (screen === 'game' && paused && e.code === 'Enter') {
        e.preventDefault();
        resume();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [screen, paused, pause, resume, snapshot.phase]);

  useEffect(() => {
    if (screen === 'game') return;
    inputRef.current?.clearTouch();
  }, [screen]);

  const handleTouchButton = useCallback((button: keyof InputState, pressed: boolean) => {
    inputRef.current?.setTouch(button, pressed);
  }, []);

  const showResult = screen === 'game' && snapshot.phase === 'result';
  const showTouch = touchMode && screen === 'game' && !paused && !showResult;

  return (
    <div className="app">
      <div className="stage-wrap" ref={containerRef}>
        <canvas ref={canvasRef} className="game-canvas" />

        {screen === 'select' && (
          <div className="overlay select-overlay">
            <CharacterSelect
              characters={CHARACTER_LIST}
              portraits={portraits}
              onConfirm={(result) => void startMatch(result)}
              onBack={() => setScreen('select')}
              muted={muted}
              onToggleMute={toggleMute}
            />
          </div>
        )}

        {screen === 'loading' && <LoadingOverlay progress={progress.value} label={progress.label} />}

        {screen === 'game' && (
          <>
            <div className="topbar">
              <button
                type="button"
                className="icon-btn"
                title={muted ? 'Wlacz dzwiek' : 'Wycisz'}
                onClick={toggleMute}
              >
                {muted ? '\u{1F507}' : '\u{1F50A}'}
              </button>
              <button
                type="button"
                className="icon-btn"
                title={touchMode ? 'Ukryj przyciski dotykowe' : 'Pokaz przyciski dotykowe'}
                onClick={() => setTouchMode((v) => !v)}
              >
                {touchMode ? '\u{1F4F1}' : '\u{2328}'}
              </button>
              <button
                type="button"
                className="icon-btn"
                title="Pauza"
                disabled={showResult}
                onClick={() => (paused ? resume() : pause())}
              >
                {paused ? '\u25B6' : '\u23F8'}
              </button>
            </div>

            <TouchControls onButton={handleTouchButton} visible={showTouch} />

            {paused && !showResult && (
              <PauseOverlay
                snapshot={snapshot}
                difficultyLabel={difficultyLabel}
                onResume={resume}
                onRestart={rematch}
                onMenu={goToSelect}
                onToggleMute={toggleMute}
                muted={muted}
              />
            )}

            {showResult && (
              <ResultOverlay
                snapshot={snapshot}
                difficultyLabel={difficultyLabel}
                onRematch={rematch}
                onMenu={goToSelect}
              />
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default App;
