let allProfiles = [];
let selectedTeam = null;
let gameId = null;

function escapeHtml(str) {
  const d = document.createElement('div');
  d.textContent = str ?? '';
  return d.innerHTML;
}

async function init() {
  await initAuth();
  if (!requireAuth()) return;

  const params = new URLSearchParams(window.location.search);
  gameId = params.get('id');
  if (!gameId) { window.location.href = 'index.html'; return; }

  const [{ data: profiles }, { data: { user } }] = await Promise.all([
    db.from('profiles').select('id, username').order('username'),
    db.auth.getUser(),
  ]);
  allProfiles = profiles ?? [];

  const { data: game, error } = await db
    .from('games')
    .select(`id, winning_team, notes, created_by, game_players(player_id, team, role)`)
    .eq('id', gameId)
    .single();

  if (error || !game) { window.location.href = 'index.html'; return; }
  if (!user || game.created_by !== user.id) { window.location.href = 'index.html'; return; }

  selectedTeam = game.winning_team;
  document.querySelector(`.team-option[data-team="${selectedTeam}"]`)?.classList.add('selected');
  if (game.notes) document.getElementById('notes').value = game.notes;

  for (const p of game.game_players) {
    addToSection(p.team, p.role, p.player_id);
  }

  document.getElementById('loading').style.display = 'none';
  document.getElementById('game-form').style.display = 'block';

  document.querySelectorAll('.add-role-player').forEach(btn => {
    btn.addEventListener('click', () => addToSection(btn.dataset.team, btn.dataset.role));
  });
  document.getElementById('game-form').addEventListener('submit', submitEdit);

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

function addToSection(team, role, selectedId = '') {
  const suffix = role === 'operative' ? 'op' : 'sm';
  const list = document.getElementById(`${team}-${suffix}-list`);
  const row = document.createElement('div');
  row.className = 'role-player-row';
  row.innerHTML = `
    <select class="form-select player-select" data-team="${team}" data-role="${role}">${buildPlayerSelect(selectedId)}</select>
    <button type="button" class="remove-player" title="Remove">&#x2715;</button>
  `;
  row.querySelector('.remove-player').addEventListener('click', () => row.remove());
  list.appendChild(row);
}

async function submitEdit(e) {
  e.preventDefault();
  clearError();

  if (!selectedTeam) {
    showError('Please select the winning team.');
    return;
  }

  const players = [];
  document.querySelectorAll('.role-player-row .player-select').forEach(sel => {
    if (sel.value) {
      players.push({ player_id: sel.value, team: sel.dataset.team, role: sel.dataset.role });
    }
  });

  if (players.length === 0) {
    showError('Add at least one player.');
    return;
  }

  const uniqueIds = new Set(players.map(p => p.player_id));
  if (uniqueIds.size !== players.length) {
    showError('Each player can only appear once per game.');
    return;
  }

  const submitBtn = document.getElementById('submit-btn');
  submitBtn.disabled = true;
  submitBtn.textContent = 'Saving...';

  const notes = document.getElementById('notes').value.trim();

  const { error: gameError } = await db
    .from('games')
    .update({ winning_team: selectedTeam, notes: notes || null })
    .eq('id', gameId);

  if (gameError) {
    showError('Failed to update game: ' + gameError.message);
    submitBtn.disabled = false;
    submitBtn.textContent = 'Save Changes';
    return;
  }

  const { error: deleteError } = await db
    .from('game_players')
    .delete()
    .eq('game_id', gameId);

  if (deleteError) {
    showError('Failed to update players: ' + deleteError.message);
    submitBtn.disabled = false;
    submitBtn.textContent = 'Save Changes';
    return;
  }

  const playerRows = players.map(p => ({
    game_id: gameId,
    player_id: p.player_id,
    team: p.team,
    role: p.role,
    won: p.team === selectedTeam,
  }));

  const { error: insertError } = await db.from('game_players').insert(playerRows);

  if (insertError) {
    showError('Failed to save players: ' + insertError.message);
    submitBtn.disabled = false;
    submitBtn.textContent = 'Save Changes';
    return;
  }

  window.location.href = 'history.html';
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
