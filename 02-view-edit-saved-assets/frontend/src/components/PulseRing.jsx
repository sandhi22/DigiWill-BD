import { useI18n } from '../i18n';

const DAY = 86_400_000;
const C = 150; // viewBox centre

function arc(r, startDeg, sweepDeg) {
  const rad = (d) => ((d - 90) * Math.PI) / 180;
  const [a, b] = [rad(startDeg), rad(startDeg + sweepDeg)];
  const x1 = C + r * Math.cos(a), y1 = C + r * Math.sin(a);
  const x2 = C + r * Math.cos(b), y2 = C + r * Math.sin(b);
  return `M${x1.toFixed(2)} ${y1.toFixed(2)} A${r} ${r} 0 0 1 ${x2.toFixed(2)} ${y2.toFixed(2)}`;
}

function Stitches({ count, live, r, width, liveClass, spentClass }) {
  const step = 360 / count;
  return Array.from({ length: count }, (_, i) => (
    <path
      key={i}
      d={arc(r, i * step + step * 0.21, step * 0.58)}
      className={i < live ? liveClass : spentClass}
      style={{ '--i': i }}
      strokeWidth={width}
      strokeLinecap="round"
      fill="none"
    />
  ));
}

/** Days left, computed the same way everywhere the ring's numbers appear. */
export function switchTiming(sw, now = Date.now()) {
  const due = new Date(sw.due_at).getTime();
  const release = new Date(sw.release_at).getTime();
  return {
    dueIn: Math.max(0, Math.ceil((due - now) / DAY)),
    releaseIn: Math.max(0, Math.ceil((release - now) / DAY)),
    overdue: sw.state === 'overdue' || (sw.state === 'active' && now >= due),
  };
}

/**
 * The check-in ring: one kantha stitch per day of the interval (max 60).
 * Stitches still "held" are indigo; days already spent fade to thread grey.
 * The inner ring is the grace period, which only starts filling once overdue.
 */
export default function PulseRing({ sw, sewing }) {
  const { t, num } = useI18n();
  const now = Date.now();
  const { dueIn, releaseIn, overdue } = switchTiming(sw, now);
  const released = sw.state === 'released';
  const state = released ? 'released' : overdue ? 'overdue' : 'active';

  const outer = Math.min(sw.interval_days, 60);
  const inner = Math.min(sw.grace_days, 30);
  const liveOuter = state === 'active' ? Math.ceil((dueIn / sw.interval_days) * outer) : released ? outer : 0;
  const liveInner = state === 'overdue' ? Math.ceil((releaseIn / sw.grace_days) * inner) : state === 'active' ? inner : inner;

  const big = released ? '—' : num(state === 'overdue' ? releaseIn : dueIn);
  const label = released
    ? t('pulse.labelReleased')
    : state === 'overdue'
      ? t('pulse.labelOverdue', { n: releaseIn })
      : t('pulse.labelActive', { n: dueIn });

  return (
    <div className={`ring${sewing ? ' sewing' : ''}`} data-state={state}>
      <svg viewBox="0 0 300 300" role="img" aria-label={`${big} ${label}`}>
        <Stitches count={outer} live={liveOuter} r={136} width={6} liveClass="s-live" spentClass="s-spent" />
        <Stitches count={inner} live={liveInner} r={116} width={3}
          liveClass={state === 'active' ? 's-grace' : 's-grace-live'} spentClass="s-grace" />
      </svg>
      <div className="ring-center" aria-hidden="true">
        <span className="ring-days">{big}</span>
        <span className="ring-label">{label}</span>
      </div>
    </div>
  );
}
