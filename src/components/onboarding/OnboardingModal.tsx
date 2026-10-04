import { useState } from 'react';
import { Compass, Locate, Navigation as NavIcon } from 'lucide-react';

interface Props {
  onAllowLocation: () => Promise<boolean>;
  onAllowCompass: () => Promise<boolean>;
  onFinish: () => void;
}

export default function OnboardingModal({
  onAllowLocation,
  onAllowCompass,
  onFinish
}: Props) {
  const [locState, setLocState] = useState<'idle' | 'busy' | 'granted' | 'denied'>('idle');
  const [compState, setCompState] = useState<'idle' | 'busy' | 'granted' | 'denied'>('idle');

  const handleLocation = async () => {
    setLocState('busy');
    const ok = await onAllowLocation();
    setLocState(ok ? 'granted' : 'denied');
  };

  const handleCompass = async () => {
    setCompState('busy');
    const ok = await onAllowCompass();
    setCompState(ok ? 'granted' : 'denied');
  };

  const bothDone =
    (locState === 'granted' || locState === 'denied') &&
    (compState === 'granted' || compState === 'denied');

  return (
    <div className="onboarding-overlay">
      <div className="onboarding-modal" role="dialog" aria-label="Witaj w Roadly">
        <div className="onboarding-modal__logo" aria-hidden>
          <NavIcon size={28} />
        </div>
        <h2 className="onboarding-modal__title">Witaj w Roadly</h2>
        <p className="onboarding-modal__sub">
          Żeby pokazać Ci trasę i prowadzić nawigację, potrzebujemy dwóch uprawnień.
        </p>

        <div className="onboarding-perm">
          <div className="onboarding-perm__icon">
            <Locate size={22} />
          </div>
          <div className="onboarding-perm__body">
            <div className="onboarding-perm__title">Lokalizacja</div>
            <div className="onboarding-perm__desc">
              Bez tego nie wiemy gdzie jesteś ani nie policzymy trasy.
            </div>
          </div>
          <button
            type="button"
            className={`btn ${locState === 'granted' ? 'btn--primary' : ''}`}
            onClick={handleLocation}
            disabled={locState === 'busy' || locState === 'granted'}
          >
            {locState === 'idle' && 'Zezwól'}
            {locState === 'busy' && 'Czekam…'}
            {locState === 'granted' && 'OK'}
            {locState === 'denied' && 'Odmówiono'}
          </button>
        </div>

        <div className="onboarding-perm">
          <div className="onboarding-perm__icon">
            <Compass size={22} />
          </div>
          <div className="onboarding-perm__body">
            <div className="onboarding-perm__title">Obrót telefonu</div>
            <div className="onboarding-perm__desc">
              Dzięki kompasowi strzałka pokazuje kierunek patrzenia i kamera obraca się razem z Tobą.
            </div>
          </div>
          <button
            type="button"
            className={`btn ${compState === 'granted' ? 'btn--primary' : ''}`}
            onClick={handleCompass}
            disabled={compState === 'busy' || compState === 'granted'}
          >
            {compState === 'idle' && 'Zezwól'}
            {compState === 'busy' && 'Czekam…'}
            {compState === 'granted' && 'OK'}
            {compState === 'denied' && 'Odmówiono'}
          </button>
        </div>

        <button
          type="button"
          className="btn btn--primary btn--block"
          onClick={onFinish}
          disabled={!bothDone}
          style={{ marginTop: 8 }}
        >
          {bothDone ? 'Rozpocznij' : 'Najpierw zezwól'}
        </button>

        <button
          type="button"
          className="btn btn--ghost"
          onClick={onFinish}
          style={{ marginTop: 4, fontSize: 13 }}
        >
          Pomiń
        </button>
      </div>
    </div>
  );
}