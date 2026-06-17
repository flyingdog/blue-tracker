// ─── Storage layer: Google Drive API + localStorage fallback ───────────────

const Storage = (() => {
  const LS_KEY = 'blue-tracker-data';
  const DRIVE_FILE_NAME = 'blue-tracker.json';
  const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.appdata';

  let _driveFileId = null;
  let _tokenClient = null;
  let _accessToken = null;
  let _onAuthChange = null;
  let _clientId = null;

  // ── Public state ──────────────────────────────────────────────────────────
  let isConnected = false;

  // ── localStorage helpers ──────────────────────────────────────────────────
  function lsLoad() {
    try {
      const raw = localStorage.getItem(LS_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  }

  function lsSave(data) {
    localStorage.setItem(LS_KEY, JSON.stringify(data));
  }

  // ── Google Drive helpers ──────────────────────────────────────────────────
  async function driveListFiles() {
    const res = await fetch(
      'https://www.googleapis.com/drive/v3/files?spaces=appDataFolder&fields=files(id,name)',
      { headers: { Authorization: `Bearer ${_accessToken}` } }
    );
    if (!res.ok) throw new Error('Drive list failed');
    return res.json();
  }

  async function driveRead(fileId) {
    const res = await fetch(
      `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
      { headers: { Authorization: `Bearer ${_accessToken}` } }
    );
    if (!res.ok) throw new Error('Drive read failed');
    return res.json();
  }

  async function driveCreate(data) {
    const meta = new Blob(
      [JSON.stringify({ name: DRIVE_FILE_NAME, parents: ['appDataFolder'] })],
      { type: 'application/json' }
    );
    const body = new Blob([JSON.stringify(data)], { type: 'application/json' });
    const form = new FormData();
    form.append('metadata', meta);
    form.append('file', body);
    const res = await fetch(
      'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id',
      { method: 'POST', headers: { Authorization: `Bearer ${_accessToken}` }, body: form }
    );
    if (!res.ok) throw new Error('Drive create failed');
    const json = await res.json();
    return json.id;
  }

  async function driveUpdate(fileId, data) {
    const body = new Blob([JSON.stringify(data)], { type: 'application/json' });
    const res = await fetch(
      `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media`,
      { method: 'PATCH', headers: { Authorization: `Bearer ${_accessToken}` }, body }
    );
    if (!res.ok) throw new Error('Drive update failed');
  }

  // ── Google Identity Services init ─────────────────────────────────────────
  function initGIS(clientId, onAuthChange) {
    _clientId = clientId;
    _onAuthChange = onAuthChange;
    if (!window.google?.accounts?.oauth2) return;
    _tokenClient = window.google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: DRIVE_SCOPE,
      callback: async (response) => {
        if (response.error) {
          console.error('GIS error:', response.error);
          return;
        }
        _accessToken = response.access_token;
        isConnected = true;
        if (_onAuthChange) _onAuthChange(true);
      },
    });
  }

  function requestAuth() {
    // GIS script may have loaded after initGIS was called — retry init if needed
    if (!_tokenClient && window.google?.accounts?.oauth2 && _clientId) {
      initGIS(_clientId, _onAuthChange);
    }
    if (_tokenClient) _tokenClient.requestAccessToken();
  }

  function signOut() {
    if (_accessToken && window.google?.accounts?.oauth2) {
      window.google.accounts.oauth2.revoke(_accessToken);
    }
    _accessToken = null;
    _driveFileId = null;
    isConnected = false;
    if (_onAuthChange) _onAuthChange(false);
  }

  // ── Public API ────────────────────────────────────────────────────────────
  async function load() {
    if (isConnected && _accessToken) {
      try {
        const list = await driveListFiles();
        const file = list.files?.find(f => f.name === DRIVE_FILE_NAME);
        if (file) {
          _driveFileId = file.id;
          const data = await driveRead(file.id);
          lsSave(data); // keep local in sync
          return data;
        }
      } catch (e) {
        console.warn('Drive load failed, falling back to localStorage:', e);
      }
    }
    return lsLoad();
  }

  async function save(data) {
    lsSave(data);
    if (isConnected && _accessToken) {
      try {
        if (_driveFileId) {
          await driveUpdate(_driveFileId, data);
        } else {
          _driveFileId = await driveCreate(data);
        }
      } catch (e) {
        console.warn('Drive save failed, data kept in localStorage:', e);
      }
    }
  }

  return { load, save, initGIS, requestAuth, signOut, get isConnected() { return isConnected; } };
})();
