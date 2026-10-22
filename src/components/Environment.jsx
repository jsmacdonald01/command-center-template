import mountain from '../assets/mountain.jpg';
import './Environment.css';

/**
 * The fixed environment behind everything. Five stacked layers, mounted
 * once at the app root and never remounted per section — that constancy
 * is what makes eight sections read as one place rather than eight pages.
 */
export default function Environment({ ambientMotion = true }) {
  return (
    <div className="cc-env" aria-hidden="true">
      <div className="cc-env-base" />
      <img className="cc-env-mountain" src={mountain} alt="" draggable="false" />
      <div className={`cc-env-fog${ambientMotion ? ' is-drifting' : ''}`} />
      <div className="cc-env-vignette" />
      <div className="cc-env-scrim" />
    </div>
  );
}
