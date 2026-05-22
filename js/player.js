function winRateColor(rate) {
  return `hsl(${Math.round(rate * 1.2)}, 65%, 55%)`;
}

function escapeHtml(str) {
  const d = document.createElement('div');
  d.textContent = str ?? '';
  return d.innerHTML;
}

function formatDateTime(isoStr) {
  return new Date(isoStr).toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit'
  });
}

async function loadPlayer() {
  const params = new URLSearchParams(window.location.search);
  const playerId = params.get('id');

  if (!playerId) {
    window.location.href = 'index.html';
    return;
  }

  await initAuth();

  const { data: profile, error: profileError } = await db
    .from('profiles')
    .select('*')
    .eq('id', playerId)
    .single();

  if (profileError || !profile) {
    document.getElementById('player-name').textContent = 'Player not found';
    return;
  }

  document.getElementById('player-name').textContent = profile.username;
  document.title = `${profile.username} — Codenames Tracker`;

  const isOwnProfile = currentUser && currentUser.id === playerId;
  if (isOwnProfile) {
    const nameEl = document.getElementById('player-name');

    const loginUsername = currentUser.email.split('@')[0];
    const loginNote = document.createElement('p');
    loginNote.className = 'login-username-note';
    loginNote.innerHTML = `Username: <strong>${loginUsername}</strong>`;
    nameEl.insertAdjacentElement('afterend', loginNote);

    const editBtn = document.createElement('button');
    editBtn.className = 'btn btn-ghost btn-sm rename-trigger-btn';
    editBtn.textContent = 'Change Display Name';
    loginNote.insertAdjacentElement('afterend', editBtn);
    editBtn.addEventListener('click', () => startRename(nameEl, editBtn, playerId));
  }

  const { data: gameRows, error: gamesError } = await db
    .from('game_players')
    .select(`
      id, team, role, won,
      games (
        id, played_at, winning_team, screenshot_url, notes, created_at
      )
    `)
    .eq('player_id', playerId)
    .order('created_at', { ascending: false });

  if (gamesError || !gameRows) {
    document.getElementById('history-list').innerHTML =
      `<div class="empty-state">Could not load game history.</div>`;
    return;
  }

  const games = gameRows.filter(r => r.games);
  const total = games.length;
  const wins = games.filter(r => r.won).length;
  const losses = total - wins;
  const rate = total > 0 ? Math.round((wins / total) * 100) : null;

  const smGames = games.filter(r => r.role === 'spymaster');
  const opGames = games.filter(r => r.role === 'operative');
  const smWins  = smGames.filter(r => r.won).length;
  const opWins  = opGames.filter(r => r.won).length;
  const smRate  = smGames.length > 0 ? Math.round(smWins / smGames.length * 100) : null;
  const opRate  = opGames.length > 0 ? Math.round(opWins / opGames.length * 100) : null;

  document.getElementById('stat-games').textContent = total;
  document.getElementById('stat-wins').textContent = wins;
  document.getElementById('stat-losses').textContent = losses;

  const rateEl = document.getElementById('stat-rate');
  if (rate !== null) {
    rateEl.textContent = `${rate}%`;
    rateEl.className = 'stat-value';
    rateEl.style.color = winRateColor(rate);
  } else {
    rateEl.textContent = '—';
  }

  function setRoleStatEl(id, wins, total) {
    const el = document.getElementById(id);
    if (!el) return;
    if (total === 0) { el.textContent = '—'; return; }
    const pct = Math.round(wins / total * 100);
    el.textContent = `${pct}%`;
    el.className = 'stat-value';
    el.style.color = winRateColor(pct);
    const sub = el.nextElementSibling?.nextElementSibling;
    if (sub) sub.textContent = `${wins}W / ${total}G`;
  }

  setRoleStatEl('stat-sm-rate', smWins, smGames.length);
  setRoleStatEl('stat-op-rate', opWins, opGames.length);

  // Best teammate
  const gameIds = games.map(r => r.games.id);
  if (gameIds.length > 0) {
    const { data: allGamePlays } = await db
      .from('game_players')
      .select('game_id, player_id, team, won, profiles(id, username)')
      .in('game_id', gameIds);

    if (allGamePlays) {
      const myGameTeam = {}, myGameWon = {};
      for (const row of games) { myGameTeam[row.games.id] = row.team; myGameWon[row.games.id] = row.won; }

      const mateMap = {};
      for (const p of allGamePlays) {
        if (p.player_id === playerId) continue;
        if (myGameTeam[p.game_id] !== p.team) continue;
        const id = p.player_id;
        if (!mateMap[id]) mateMap[id] = { id, wins: 0, total: 0, name: p.profiles?.username ?? '?' };
        mateMap[id].total++;
        if (myGameWon[p.game_id]) mateMap[id].wins++;
      }

      const mates = Object.values(mateMap).filter(m => m.total >= 2);
      if (mates.length) {
        const best = mates
          .map(m => ({ ...m, rate: Math.round(m.wins / m.total * 100) }))
          .sort((a, b) => b.rate - a.rate || b.wins - a.wins)[0];

        const mateEl = document.getElementById('stat-best-mate');
        const mateSubEl = document.getElementById('stat-best-mate-sub');
        if (mateEl) {
          mateEl.innerHTML = `<a href="player.html?id=${best.id}" class="player-link" style="font-size:1.1rem">${escapeHtml(best.name)}</a>`;
        }
        if (mateSubEl) mateSubEl.textContent = `${best.rate}% · ${best.wins}/${best.total}G`;
      }
    }
  }

  // Best streak (highest consecutive wins, oldest-first traversal)
  let bestStreak = 0, currentStreak = 0;
  for (let i = games.length - 1; i >= 0; i--) {
    if (games[i].won) { currentStreak++; bestStreak = Math.max(bestStreak, currentStreak); }
    else currentStreak = 0;
  }
  const bestStreakEl = document.getElementById('stat-best-streak');
  if (bestStreakEl) {
    bestStreakEl.textContent = total > 0 ? bestStreak : '—';
  }

  const historyEl = document.getElementById('history-list');

  if (games.length === 0) {
    historyEl.innerHTML = `<div class="empty-state">No games logged yet.</div>`;
    return;
  }

  historyEl.innerHTML = games.map(row => {
    const g = row.games;
    const resultClass = row.won ? 'win' : 'loss';
    const resultPill = row.won
      ? `<span class="result-pill result-pill-win">Win</span>`
      : `<span class="result-pill result-pill-loss">Loss</span>`;
    const teamBadge = `<span class="badge badge-${row.team}">${row.team} team</span>`;
    const roleBadge = `<span class="badge" style="background:var(--surface2);border:1px solid var(--border)">${row.role}</span>`;

    const screenshotLink = g.screenshot_url
      ? `<a href="${escapeHtml(g.screenshot_url)}" target="_blank" rel="noopener" class="screenshot-preview-link">
           <img src="${escapeHtml(g.screenshot_url)}" alt="Game screenshot" class="screenshot-preview">
         </a>`
      : '';

    const notes = g.notes
      ? `<div class="game-notes">${escapeHtml(g.notes)}</div>`
      : '';

    return `
      <div class="game-item ${resultClass}">
        <div class="game-info">
          <div class="game-date">${formatDateTime(g.created_at)}</div>
          <div class="game-details">
            ${teamBadge}
            ${roleBadge}
          </div>
          ${notes}
          ${screenshotLink}
        </div>
        ${resultPill}
      </div>
    `;
  }).join('');
}

function startRename(nameEl, triggerBtn, playerId) {
  const current = nameEl.textContent.trim();
  const input = document.createElement('input');
  input.type = 'text';
  input.value = current;
  input.className = 'rename-input';
  input.maxLength = 32;

  const saveBtn = document.createElement('button');
  saveBtn.className = 'btn btn-primary btn-sm rename-save';
  saveBtn.textContent = 'Save';

  const cancelBtn = document.createElement('button');
  cancelBtn.className = 'btn btn-ghost btn-sm';
  cancelBtn.textContent = 'Cancel';

  const hint = document.createElement('span');
  hint.className = 'rename-hint';
  hint.textContent = 'Display name only — your login username stays the same.';

  const row = document.createElement('div');
  row.className = 'rename-row';
  row.appendChild(input);
  row.appendChild(saveBtn);
  row.appendChild(cancelBtn);
  row.appendChild(hint);

  nameEl.replaceWith(row);
  triggerBtn.style.display = 'none';
  input.focus();
  input.select();

  function restore(displayName) {
    const h1 = document.createElement('h1');
    h1.className = 'page-title';
    h1.id = 'player-name';
    h1.textContent = displayName;
    row.replaceWith(h1);
    triggerBtn.style.display = '';
    triggerBtn.onclick = () => startRename(h1, triggerBtn, playerId);
  }

  async function save() {
    const newName = input.value.trim();
    if (!newName || newName === current) { restore(current); return; }

    saveBtn.disabled = true;
    saveBtn.textContent = 'Saving...';

    const { data: existing } = await db
      .from('profiles').select('id').eq('username', newName).neq('id', playerId).single();
    if (existing) {
      alert('That name is already taken.');
      saveBtn.disabled = false;
      saveBtn.textContent = 'Save';
      return;
    }

    const { error } = await db.from('profiles').update({ username: newName }).eq('id', playerId);
    if (error) {
      alert('Failed to update name: ' + error.message);
      saveBtn.disabled = false;
      saveBtn.textContent = 'Save';
      return;
    }

    document.title = `${newName} — Codenames Tracker`;
    restore(newName);
  }

  saveBtn.addEventListener('click', save);
  cancelBtn.addEventListener('click', () => restore(current));
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') save();
    if (e.key === 'Escape') cancel();
  });
}

loadPlayer();
