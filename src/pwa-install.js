import { icon } from '../assets/icons.js';

let deferredPrompt = null;
let installButton = null;

function ensureInstallButton() {
  if (installButton || typeof document === 'undefined') return installButton;
  installButton = document.createElement('button');
  installButton.className = 'pwa-install';
  installButton.type = 'button';
  installButton.innerHTML = `${icon('download')} Pasang ProQTrack`;
  installButton.hidden = true;
  document.body.appendChild(installButton);
  installButton.addEventListener('click', async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    await deferredPrompt.userChoice.catch(() => null);
    deferredPrompt = null;
    installButton.classList.remove('show');
    installButton.hidden = true;
  });
  return installButton;
}

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault();
    deferredPrompt = event;
    const button = ensureInstallButton();
    button.hidden = false;
    button.classList.add('show');
  });
  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    if (installButton) {
      installButton.classList.remove('show');
      installButton.hidden = true;
    }
  });
}

ensureInstallButton();
