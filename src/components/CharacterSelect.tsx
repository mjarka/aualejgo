import { useEffect, useRef, useState } from 'react';
import type { ReactElement } from 'react';
import type { CharacterDef, CharacterId } from '../game/types';
import type { DifficultyKey } from '../game/config/balance';
import { DIFFICULTY } from '../game/config/balance';
import { CONTROL_HINTS } from '../game/systems/input';
import { imageSize } from '../game/core/image';

export interface SelectResult {
  player: CharacterId;
  bot: CharacterId;
  difficulty: DifficultyKey;
}

interface CharacterSelectProps {
  characters: readonly CharacterDef[];
  /** Portrety wczytane przez loader (klucz = id postaci). */
  portraits: Record<string, CanvasImageSource>;
  onConfirm: (result: SelectResult) => void;
  onBack: () => void;
  muted: boolean;
  onToggleMute: () => void;
}

type Slot = 'player' | 'bot';

/** Rysuje portret w pixel-artowym stylu, zachowujac ostre piksele. */
const PortraitCanvas = ({
  image,
  highlight,
  label,
  sublabel,
  onClick,
  disabled,
}: {
  image: CanvasImageSource | undefined;
  highlight: boolean;
  label: string;
  sublabel: string;
  onClick: () => void;
  disabled: boolean;
}): ReactElement => {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || !image) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const srcW = imageSize(image).w;
    const srcH = imageSize(image).h;
    if (!srcW || !srcH) return;

    // wypelnij cala szerokosc, przytnij nadmiar wysokosci od gory
    const scale = canvas.width / srcW;
    const drawH = srcH * scale;
    ctx.drawImage(image, 0, 0, srcW, srcH, 0, canvas.height - drawH, canvas.width, drawH);
  }, [image]);

  return (
    <button
      type="button"
      className={`portrait-card ${highlight ? 'selected' : ''}`}
      onClick={onClick}
      disabled={disabled}
      aria-pressed={highlight}
    >
      <canvas ref={ref} width={200} height={300} className="portrait-canvas" />
      <span className="portrait-name">{label}</span>
      <span className="portrait-role">{sublabel}</span>
    </button>
  );
};

/**
 * Pierwszy ekran gry - wybor postaci gracza i bota oraz poziomu trudnosci.
 *
 * Ten sam portret nie moze byc wybrany jednoczesnie dla gracza i bota,
 * dlatego druga postac jest automatycznie przelaczana na wolna.
 */
export const CharacterSelect = ({
  characters,
  portraits,
  onConfirm,
  onBack,
  muted,
  onToggleMute,
}: CharacterSelectProps): ReactElement => {
  const [playerId, setPlayerId] = useState<CharacterId>(characters[0]?.id ?? 'c1');
  const [botId, setBotId] = useState<CharacterId>(characters[1]?.id ?? 'c2');
  const [difficulty, setDifficulty] = useState<DifficultyKey>('normal');
  const [activeSlot, setActiveSlot] = useState<Slot>('player');

  const selectCharacter = (id: CharacterId): void => {
    if (activeSlot === 'player') {
      setPlayerId(id);
      if (id === botId) {
        const other = characters.find((c) => c.id !== id);
        if (other) setBotId(other.id);
      }
    } else {
      setBotId(id);
      if (id === playerId) {
        const other = characters.find((c) => c.id !== id);
        if (other) setPlayerId(other.id);
      }
    }
  };

  const playerChar = characters.find((c) => c.id === playerId);
  const botChar = characters.find((c) => c.id === botId);

  return (
    <div className="select-screen">
      <header className="select-header">
        <h1>WYBIERZ POSTACIE</h1>
        <p className="select-hint">
          Kliknij postac, aby przypisac ja do aktywnego slotu. Przelaczaj sloty przyciskami
          poniżej.
        </p>
      </header>

      <div className="slot-tabs" role="group" aria-label="Aktywny slot">
        <button
          type="button"
          className={`slot-tab ${activeSlot === 'player' ? 'active' : ''}`}
          aria-pressed={activeSlot === 'player'}
          onClick={() => setActiveSlot('player')}
        >
          <span className="slot-label">GRACZ</span>
          <span className="slot-value">{playerChar?.name ?? '—'}</span>
        </button>
        <button
          type="button"
          className={`slot-tab ${activeSlot === 'bot' ? 'active' : ''}`}
          aria-pressed={activeSlot === 'bot'}
          onClick={() => setActiveSlot('bot')}
        >
          <span className="slot-label">BOT</span>
          <span className="slot-value">{botChar?.name ?? '—'}</span>
        </button>
      </div>

      <div className="portrait-row">
        {characters.map((c) => (
          <PortraitCanvas
            key={c.id}
            image={portraits[c.id]}
            highlight={
              (activeSlot === 'player' && c.id === playerId) ||
              (activeSlot === 'bot' && c.id === botId)
            }
            label={c.name}
            sublabel={
              c.id === playerId && c.id === botId
                ? 'gracz + bot'
                : c.id === playerId
                  ? 'gracz'
                  : c.id === botId
                    ? 'bot'
                    : 'wolna'
            }
            onClick={() => selectCharacter(c.id)}
            disabled={false}
          />
        ))}
      </div>

      <div className="select-footer">
        <div className="field">
          <span className="field-label">Poziom trudnosci</span>
          <div className="seg" role="group" aria-label="Poziom trudnosci">
            {(Object.keys(DIFFICULTY) as DifficultyKey[]).map((key) => (
              <button
                key={key}
                type="button"
                aria-pressed={difficulty === key}
                onClick={() => setDifficulty(key)}
              >
                {DIFFICULTY[key].label}
              </button>
            ))}
          </div>
        </div>

        <div className="select-actions">
          <button
            type="button"
            className="btn primary"
            onClick={() => onConfirm({ player: playerId, bot: botId, difficulty })}
          >
            Walcz
          </button>
          <button type="button" className="btn" onClick={onToggleMute}>
            {muted ? 'Dzwiek: off' : 'Dzwiek: on'}
          </button>
          <button type="button" className="btn" onClick={onBack}>
            Wstecz
          </button>
        </div>
      </div>

      <details className="controls-details">
        <summary>Sterowanie</summary>
        <div className="controls-grid">
          {CONTROL_HINTS.map((hint) => (
            <div key={hint.keys}>
              <span className="key">{hint.keys}</span>
              <span className="act">{hint.action}</span>
            </div>
          ))}
        </div>
      </details>
    </div>
  );
};
