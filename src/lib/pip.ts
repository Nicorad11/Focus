// Browser build: the mini window opens as a Document Picture-in-Picture window, which stays on top of
// other windows like the desktop app's mini window does (Chrome and Edge 116+).

import { createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { MiniCard } from '../components/MiniCard';
import { toast } from '../components/Toasts';

interface DocumentPiP {
  requestWindow(opts: { width: number; height: number }): Promise<Window>;
  window: Window | null;
}

export async function openMiniWindow() {
  const dpip = (window as unknown as { documentPictureInPicture?: DocumentPiP }).documentPictureInPicture;
  if (!dpip) {
    toast('This browser can’t keep a mini window on top. The Windows app can, and Chrome or Edge can too.');
    return;
  }
  if (dpip.window) {
    dpip.window.focus();
    return;
  }
  const pip = await dpip.requestWindow({ width: 420, height: 150 });
  for (const sheet of Array.from(document.styleSheets)) {
    try {
      const style = pip.document.createElement('style');
      style.textContent = Array.from(sheet.cssRules)
        .map((r) => r.cssText)
        .join('\n');
      pip.document.head.appendChild(style);
    } catch {
      if (sheet.href) {
        const link = pip.document.createElement('link');
        link.rel = 'stylesheet';
        link.href = sheet.href;
        pip.document.head.appendChild(link);
      }
    }
  }
  pip.document.documentElement.dataset.theme = document.documentElement.dataset.theme ?? 'day';
  pip.document.body.className = 'mini-window';
  const mount = pip.document.createElement('div');
  pip.document.body.appendChild(mount);
  const root = createRoot(mount);
  root.render(createElement(MiniCard, { onClose: () => pip.close() }));
  pip.addEventListener('pagehide', () => root.unmount());
}
