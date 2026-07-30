import { THEME_COOKIE } from '@/lib/theme';

/**
 * Runs before first paint, and only has work to do when the preference is
 * `system`: the server already emitted the right class for an explicit choice,
 * but it cannot know the operating system's setting.
 *
 * Kept deliberately tiny and dependency-free — it is inlined into <head> and
 * blocks rendering.
 */
const SCRIPT = `(function(){try{
var r=document.documentElement;
var m=document.cookie.match(/(?:^|; )${THEME_COOKIE}=([^;]*)/);
var p=m?decodeURIComponent(m[1]):'system';
if(p!=='light'&&p!=='dark')p='system';
r.dataset.theme=p;
var d=p==='dark'||(p==='system'&&window.matchMedia('(prefers-color-scheme: dark)').matches);
r.classList.toggle('dark',d);
}catch(e){}})();`;

export function ThemeScript() {
  return <script dangerouslySetInnerHTML={{ __html: SCRIPT }} />;
}
