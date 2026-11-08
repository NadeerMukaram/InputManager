// ─── State ──────────────────────────────────────────────────────────────────
let state = { move: false, m1: false, m2: false, keys: false };
let busy  = false;
let countdownInterval = null;
let countdownValue    = 60;

// ─── Element refs ────────────────────────────────────────────────────────────
const appMain      = document.getElementById('app-main');
const stateLabel   = document.getElementById('state-label');
const stateSub     = document.getElementById('state-sub');
const safetyBanner = document.getElementById('safety-banner');
const countdownEl  = document.getElementById('countdown');
const masterBtn    = document.getElementById('master-btn');
const masterLabel  = document.getElementById('master-label');
const masterSpinner= document.getElementById('master-spinner');

const checkboxes = {
  move: document.getElementById('chk-move'),
  m1:   document.getElementById('chk-m1'),
  m2:   document.getElementById('chk-m2'),
  keys: document.getElementById('chk-keys'),
};
const rows = {
  move: document.getElementById('row-move'),
  m1:   document.getElementById('row-m1'),
  m2:   document.getElementById('row-m2'),
  keys: document.getElementById('row-keys'),
};

// ─── UI Update ───────────────────────────────────────────────────────────────
function applyState(newState) {
  state = { ...newState };

  const anyBlocked = state.move || state.m1 || state.m2 || state.keys;
  const allBlocked = state.move && state.m1 && state.m2 && state.keys;
  const mouseOnly = !state.move && !state.m1 && !state.m2;

  // Orb / body class
  appMain.classList.remove('all-blocked', 'some-blocked');
  if (allBlocked)       appMain.classList.add('all-blocked');
  else if (anyBlocked)  appMain.classList.add('some-blocked');

  // Status text
  if (!anyBlocked) {
    stateLabel.textContent = 'Input Active';
    stateSub.textContent   = 'Mouse and keyboard are enabled';
  } else if (allBlocked) {
    stateLabel.textContent = 'Input Disabled';
    stateSub.textContent   = 'Mouse and keyboard are blocked';
  } else if (state.keys && mouseOnly) {
    stateLabel.textContent = 'Keyboard Disabled';
    stateSub.textContent   = 'Key presses are blocked';
  } else {
    const blocked = [];
    if (state.move) blocked.push('movement');
    if (state.m1)   blocked.push('left click');
    if (state.m2)   blocked.push('right click');
    if (state.keys) blocked.push('keyboard');
    stateLabel.textContent = 'Partially Disabled';
    stateSub.textContent   = `Blocking: ${blocked.join(', ')}`;
  }

  // Individual checkboxes + row styles
  for (const key of ['move', 'm1', 'm2', 'keys']) {
    checkboxes[key].checked = state[key];
    rows[key].classList.toggle('blocked', state[key]);
  }

  // Master button
  if (allBlocked) {
    masterBtn.classList.add('enable-mode');
    masterLabel.textContent = 'Enable all';
  } else {
    masterBtn.classList.remove('enable-mode');
    masterLabel.textContent = 'Disable all';
  }

  // Safety banner
  if (anyBlocked) {
    safetyBanner.style.display = 'flex';
    if (!countdownInterval) startCountdown();
  } else {
    safetyBanner.style.display = 'none';
    stopCountdown();
  }
}

// ─── Countdown ───────────────────────────────────────────────────────────────
function startCountdown() {
  countdownValue = 60;
  if (countdownEl) countdownEl.textContent = countdownValue;
  stopCountdown();
  countdownInterval = setInterval(() => {
    countdownValue--;
    if (countdownEl) countdownEl.textContent = countdownValue;
    if (countdownValue <= 0) {
      stopCountdown();
      // Auto-restore everything
      handleUnblockAll();
    }
  }, 1000);
}
function stopCountdown() {
  if (countdownInterval) { clearInterval(countdownInterval); countdownInterval = null; }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function setBusy(value) {
  busy = value;
  masterBtn.disabled = value;
  masterSpinner.classList.toggle('show', value);
  for (const cb of Object.values(checkboxes)) cb.disabled = value;
}

// ─── Handlers ────────────────────────────────────────────────────────────────
async function handleFeatureToggle(key, value) {
  if (busy) { checkboxes[key].checked = !value; return; } // revert optimistic
  setBusy(true);
  try {
    const result = await window.mouseAPI.setFeature(key, value);
    if (result.state) applyState(result.state);
    else checkboxes[key].checked = !value;
    if (!result.success) alert('Failed: ' + (result.error || 'Unknown error'));
  } catch (err) {
    checkboxes[key].checked = !value;
    alert('Error: ' + err.message);
  } finally {
    setBusy(false);
  }
}

async function handleMasterBtn() {
  if (busy) return;
  const allBlocked = state.move && state.m1 && state.m2 && state.keys;
  setBusy(true);
  masterSpinner.classList.add('show');
  try {
    if (allBlocked) {
      await handleUnblockAll(true);
    } else {
      const result = await window.mouseAPI.blockAll();
      if (result.state) applyState(result.state);
      if (!result.success) alert('Failed: ' + (result.error || 'Unknown error'));
    }
  } catch (err) {
    alert('Error: ' + err.message);
  } finally {
    setBusy(false);
    masterSpinner.classList.remove('show');
  }
}

async function handleUnblockAll(calledFromMaster = false) {
  try {
    const result = await window.mouseAPI.unblockAll();
    if (result.success) applyState(result.state);
  } catch (err) {
    if (calledFromMaster) alert('Error: ' + err.message);
  }
}

// ─── Init ─────────────────────────────────────────────────────────────────────
async function init() {
  // Window controls
  document.getElementById('btn-minimize').addEventListener('click', () => window.mouseAPI.minimizeWindow());
  document.getElementById('btn-close').addEventListener('click',    () => window.mouseAPI.closeWindow());

  // Individual toggles
  for (const [key, cb] of Object.entries(checkboxes)) {
    cb.addEventListener('change', () => handleFeatureToggle(key, cb.checked));
  }

  // Master button
  masterBtn.addEventListener('click', handleMasterBtn);

  // Live push from main (hook exit or the unblock shortcut)
  window.mouseAPI.onStateUpdate((data) => {
    applyState(data);
  });

  // Load initial state
  const initialState = await window.mouseAPI.getState();
  applyState(initialState);
}

document.addEventListener('DOMContentLoaded', init);
