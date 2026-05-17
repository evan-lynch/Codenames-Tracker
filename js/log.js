let allProfiles = [];
let selectedTeam = null;

function escapeHtml(str) {
  const d = document.createElement('div');
  d.textContent = str ?? '';
  return d.innerHTML;
}

async function init() {
  const { user } = await initAuth();
  if (!requireAuth()) return;

  const { data } = await db.from('profiles').select('id, username').order('username');
  allProfiles = data ?? [];

  document.getElementById('loading').style.display = 'none';
  document.getElementById('form-content').style.display = 'block';

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
}

function buildPlayerSelect(selectedId = '') {
  const options = allProfiles.map(p =>
    `<option value="${p.id}" ${p.id === selectedId ? 'selected' : ''}>${escapeHtml(p.username)}</option>`
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

  const playedAt = document.getElementById('played-at').value;
  const screenshotUrl = document.getElementById('screenshot-url').value.trim();
  const notes = document.getElementById('notes').value.trim();

  const submitBtn = document.getElementById('submit-btn');
  submitBtn.disabled = true;
  submitBtn.textContent = 'Saving...';

  const { data: game, error: gameError } = await db
    .from('games')
    .insert({
      played_at: playedAt,
      winning_team: selectedTeam,
      screenshot_url: screenshotUrl || null,
      notes: notes || null,
      created_by: (await db.auth.getUser()).data.user.id,
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
}

function clearError() {
  const el = document.getElementById('error-msg');
  el.textContent = '';
  el.style.display = 'none';
}

init();
