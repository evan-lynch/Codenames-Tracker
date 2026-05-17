let allProfiles = [];
let selectedTeam = null;

function escapeHtml(str) {
  const d = document.createElement('div');
  d.textContent = str ?? '';
  return d.innerHTML;
}

function localDateString() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

async function hashFile(file) {
  const buffer = await file.arrayBuffer();
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
  return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function init() {
  await initAuth();
  if (!requireAuth()) return;

  const { data } = await db.from('profiles').select('id, username').order('username');
  allProfiles = data ?? [];

  document.getElementById('loading').style.display = 'none';
  document.getElementById('game-form').style.display = 'block';

  addPlayerRow();
  addPlayerRow();

  document.getElementById('add-player').addEventListener('click', addPlayerRow);
  document.getElementById('game-form').addEventListener('submit', submitGame);

  document.querySelectorAll('.team-option').forEach(btn => {
    btn.addEventListener('click', () => {
      selectedTeam = btn.dataset.team;
      document.querySelectorAll('.team-option').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
    });
  });

  document.getElementById('screenshot-file').addEventListener('change', (e) => {
    const file = e.target.files[0];
    const display = document.getElementById('file-name-display');
    const label = document.getElementById('file-upload-label');
    const previewWrap = document.getElementById('screenshot-preview-wrap');
    const preview = document.getElementById('screenshot-preview');

    if (file) {
      display.textContent = file.name;
      label.classList.add('has-file');
      preview.src = URL.createObjectURL(file);
      previewWrap.style.display = 'block';
    } else {
      display.textContent = 'Click to upload screenshot';
      label.classList.remove('has-file');
      previewWrap.style.display = 'none';
    }
  });
}

function buildPlayerSelect() {
  const options = allProfiles.map(p =>
    `<option value="${p.id}">${escapeHtml(p.username)}</option>`
  ).join('');
  return `<option value="">— Player —</option>${options}`;
}

function addPlayerRow() {
  const container = document.getElementById('player-rows');
  const row = document.createElement('div');
  row.className = 'player-row';
  row.innerHTML = `
    <select class="form-select player-select">${buildPlayerSelect()}</select>
    <select class="form-select team-select">
      <option value="">Team</option>
      <option value="red">Red</option>
      <option value="blue">Blue</option>
    </select>
    <select class="form-select role-select">
      <option value="">Role</option>
      <option value="spymaster">Spymaster</option>
      <option value="operative">Operative</option>
    </select>
    <button type="button" class="remove-player" title="Remove">&#x2715;</button>
  `;
  row.querySelector('.remove-player').addEventListener('click', () => {
    if (document.querySelectorAll('.player-row').length > 1) row.remove();
  });
  container.appendChild(row);
}

function compressImage(file, maxPx = 1920, quality = 0.8) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onerror = () => reject(new Error('Could not read image file.'));
    img.onload = () => {
      let { width, height } = img;
      if (width > maxPx || height > maxPx) {
        if (width >= height) { height = Math.round(height * maxPx / width); width = maxPx; }
        else { width = Math.round(width * maxPx / height); height = maxPx; }
      }
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      canvas.getContext('2d').drawImage(img, 0, 0, width, height);
      canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Compression failed.')), 'image/jpeg', quality);
      URL.revokeObjectURL(img.src);
    };
    img.src = URL.createObjectURL(file);
  });
}

async function uploadScreenshot(file) {
  const compressed = await compressImage(file);
  const filename = `${Date.now()}-${Math.random().toString(36).slice(2)}.jpg`;

  const { error } = await db.storage
    .from('screenshots')
    .upload(filename, compressed, { contentType: 'image/jpeg' });

  if (error) throw new Error('Screenshot upload failed: ' + error.message);

  const { data } = db.storage.from('screenshots').getPublicUrl(filename);
  return data.publicUrl;
}

async function submitGame(e) {
  e.preventDefault();
  clearError();

  if (!selectedTeam) {
    showError('Please select the winning team.');
    return;
  }

  const rows = document.querySelectorAll('.player-row');
  const players = [];
  let valid = true;

  rows.forEach(row => {
    const playerId = row.querySelector('.player-select').value;
    const team = row.querySelector('.team-select').value;
    const role = row.querySelector('.role-select').value;
    if (playerId || team || role) {
      if (!playerId || !team || !role) { valid = false; return; }
      players.push({ player_id: playerId, team, role });
    }
  });

  if (!valid) {
    showError('Each player row must have a player, team, and role selected.');
    return;
  }

  if (players.length === 0) {
    showError('Add at least one player.');
    return;
  }

  const uniqueIds = new Set(players.map(p => p.player_id));
  if (uniqueIds.size !== players.length) {
    showError('Each player can only appear once per game.');
    return;
  }

  const fileInput = document.getElementById('screenshot-file');
  if (!fileInput.files[0]) {
    showError('A screenshot is required to log a game.');
    return;
  }

  const submitBtn = document.getElementById('submit-btn');
  submitBtn.disabled = true;

  const file = fileInput.files[0];

  submitBtn.textContent = 'Checking screenshot...';
  let fileHash;
  try {
    fileHash = await hashFile(file);
  } catch {
    showError('Could not read the screenshot file.');
    submitBtn.disabled = false;
    submitBtn.textContent = 'Log Game';
    return;
  }

  const { data: duplicate } = await db
    .from('games')
    .select('id')
    .eq('screenshot_hash', fileHash)
    .maybeSingle();

  if (duplicate) {
    showError('This screenshot has already been used to log a game. Someone may have already submitted this result.');
    submitBtn.disabled = false;
    submitBtn.textContent = 'Log Game';
    return;
  }

  submitBtn.textContent = 'Uploading screenshot...';
  let screenshotUrl;
  try {
    screenshotUrl = await uploadScreenshot(file);
  } catch (err) {
    showError(err.message);
    submitBtn.disabled = false;
    submitBtn.textContent = 'Log Game';
    return;
  }

  submitBtn.textContent = 'Saving...';

  const notes = document.getElementById('notes').value.trim();
  const { data: { user } } = await db.auth.getUser();

  const { data: game, error: gameError } = await db
    .from('games')
    .insert({
      played_at: localDateString(),
      winning_team: selectedTeam,
      screenshot_url: screenshotUrl,
      screenshot_hash: fileHash,
      notes: notes || null,
      created_by: user.id,
    })
    .select()
    .single();

  if (gameError) {
    showError('Failed to save game: ' + gameError.message);
    submitBtn.disabled = false;
    submitBtn.textContent = 'Log Game';
    return;
  }

  const playerRows = players.map(p => ({
    game_id: game.id,
    player_id: p.player_id,
    team: p.team,
    role: p.role,
    won: p.team === selectedTeam,
  }));

  const { error: playersError } = await db.from('game_players').insert(playerRows);

  if (playersError) {
    showError('Game saved but player data failed: ' + playersError.message);
    submitBtn.disabled = false;
    submitBtn.textContent = 'Log Game';
    return;
  }

  window.location.href = 'index.html';
}

function showError(msg) {
  const el = document.getElementById('error-msg');
  el.textContent = msg;
  el.style.display = 'block';
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function clearError() {
  const el = document.getElementById('error-msg');
  el.textContent = '';
  el.style.display = 'none';
}

init();
