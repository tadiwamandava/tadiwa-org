/**
 * Applies the stored theme before first paint.
 *
 * This must be a blocking inline script in the body's first position: any
 * async/deferred alternative paints the default theme first, and a dark-mode
 * visitor gets a full-brightness cream flash on every cold load. That flash is
 * the single most common "this site was assembled, not built" tell.
 *
 * Kept deliberately tiny — it is render-blocking, so every byte is on the
 * critical path.
 */

const BOOTSTRAP = `(function(){try{var t=localStorage.getItem("theme");if(t==="dark"||t==="light"){document.documentElement.setAttribute("data-theme",t)}}catch(e){}})()`;

export function ThemeScript() {
  return <script dangerouslySetInnerHTML={{ __html: BOOTSTRAP }} />;
}
