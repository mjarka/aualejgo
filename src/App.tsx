import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactElement } from 'react';
import { CharacterSelect, type SelectResult } from './components/CharacterSelect';
import { LoadingOverlay, PauseOverlay, ResultOverlay } from './components/Overlays';
import { TouchControls } from './components/TouchControls';
import { Game } from './game/Game';
import { Renderer } from './game/core/renderer';
import { InputManager } from './game/systems/input';
import { AudioManager, SFX_FILES } from './game/assets/audio';
import { ensureGameFont } from './game/render/font';
import { loadAssets, type LoadedAssets } from './game/assets/loader';
import { CHARACTER_LIST } from './game/config/characters';
import { STAGE } from './game/config/stages';
import { DIFFICULTY } from './game/config/balance';
import {
  enterGameFullscreen,
  isCoarsePointer,
  isFullscreen,
  isTouchDevice,
  leaveGameFullscreen,
} from './game/systems/fullscreen';
import type { GameSnapshot, InputState } from './game/types';

type Screen = 'select' | 'loading' | 'game';

// Podklad muzyczny nie jest tu ladowany - jest duzy i wczytuje go `ensureMusic`,
// zeby nie opoznial wejscia do walki.
const AUDIO_FILES = [...Object.values(SFX_FILES)];

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

/** Czy ekran jest w pionie - wtedy gra prosi o obrocenie telefonu. */
const isPortrait = (): boolean =>
  typeof window !== 'undefined' && window.matchMedia('(orientation: portrait)').matches;

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
  const [fullscreen, setFullscreen] = useState(false);
  const [portrait, setPortrait] = useState(isPortrait);

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

  // Wyciszenie czytamy z referencji, a nie z zaleznosci `ensureAudio` - inaczej
  // przelaczenie przycisku zmienialoby tozsamosc `startMusic`, efekt startujacy
  // podklad uruchamialby sie od nowa i muzyka wracalaby do poczatku utworu.
  const mutedRef = useRef(muted);
  mutedRef.current = muted;

  const ensureAudio = useCallback((): AudioManager => {
    if (!audioRef.current) {
      const Ctor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new Ctor();
      const manager = new AudioManager(ctx);
      manager.setMuted(mutedRef.current);
      audioRef.current = manager;
    }
    return audioRef.current;
  }, []);

  /**
   * Startuje podklad muzyczny.
   *
   * Muzyka gra przez caly czas dzialania gry - takze na ekranie wyboru postaci
   * i na ekranie wyniku. Wolamy to przy kazdym gescie uzytkownika, bo
   * przegladarka moze wstrzymac audio az do pierwszego z nich.
   */
  const startMusic = useCallback((): void => {
    const audio = ensureAudio();
    void audio.resume().then(() => {
      audio.startMusic();
      void audio.ensureMusic();
    });
  }, [ensureAudio]);

  const toggleMute = useCallback(() => {
    setMuted((prev) => {
      const next = !prev;
      audioRef.current?.setMuted(next);
      return next;
    });
  }, []);

  // Podklad startuje przy pierwszym gescie uzytkownika - przegladarka blokuje
  // audio do tego momentu. Proba od razu tez ma sens: jesli przegladarka na to
  // pozwala (np. strona jest juz "oswojona"), muzyka ruszy bez klikania.
  useEffect(() => {
    startMusic();
    const onGesture = (): void => startMusic();
    window.addEventListener('pointerdown', onGesture);
    window.addEventListener('keydown', onGesture);
    return () => {
      window.removeEventListener('pointerdown', onGesture);
      window.removeEventListener('keydown', onGesture);
      // Podkladu nie zatrzymujemy przy odmontowaniu - w trybie StrictMode React
      // uruchamia efekt dwukrotnie i utwor wracalby do poczatku. Kontekst audio
      // i tak konczy zycie razem ze strona.
    };
  }, [startMusic]);

  // ------------------------------------------------- pelny ekran i orientacja

  // Pion blokuje zabawe: postacie sa szersze niz wyzsze, a przyciski dotykowe
  // zabieraja pol ekranu. Pokazujemy wtedy prosbe o obrocenie telefonu.
  useEffect(() => {
    const update = (): void => setPortrait(isPortrait());
    window.addEventListener('resize', update);
    window.addEventListener('orientationchange', update);
    const mq = window.matchMedia('(orientation: portrait)');
    mq.addEventListener('change', update);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('orientationchange', update);
      mq.removeEventListener('change', update);
    };
  }, []);

  // Pelny ekran moze zostac zamkniety gestem systemowym - wtedy wracamy do
  // stanu "okno", zeby przycisk znow proponowal tryb pelnoekranowy.
  useEffect(() => {
    const update = (): void => setFullscreen(isFullscreen());
    document.addEventListener('fullscreenchange', update);
    document.addEventListener('webkitfullscreenchange', update);
    return () => {
      document.removeEventListener('fullscreenchange', update);
      document.removeEventListener('webkitfullscreenchange', update);
    };
  }, []);

  const toggleFullscreen = useCallback((): void => {
    if (isFullscreen()) {
      void leaveGameFullscreen().then(() => setFullscreen(false));
      return;
    }
    void enterGameFullscreen().then((ok) => setFullscreen(ok));
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

      // Klikniecie "Walcz" to gest uzytkownika, wiec tylko tutaj przegladarka
      // pozwoli wejsc w pelny ekran i zablokowac orientacje pozioma. Robimy to
      // wylacznie na urzadzeniach dotykowych bez myszy - na laptopie z ekranem
      // dotykowym pelny ekran bylby niespodzianka.
      if (isCoarsePointer()) void enterGameFullscreen().then(setFullscreen);

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
    // podklad gra dalej - towarzyszy calej grze, nie tylko walce
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

        {portrait && isCoarsePointer() && (
          <div className="rotate-overlay">
            <div className="rotate-phone" aria-hidden="true" />
            <p>Obróć telefon</p>
            <span>Gra działa tylko w poziomie</span>
            <button type="button" className="btn" onClick={() => void enterGameFullscreen()}>
              Pełny ekran
            </button>
          </div>
        )}

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
                title={fullscreen ? 'Wyjd\u017a z pe\u0142nego ekranu' : 'Pe\u0142ny ekran'}
                onClick={toggleFullscreen}
              >
                {fullscreen ? '\u{1F5D7}' : '\u26F6'}
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
