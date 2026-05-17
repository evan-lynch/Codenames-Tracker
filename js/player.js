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

  document.getElementById('stat-wins').textContent = wins;
  document.getElementById('stat-losses').textContent = losses;

  const rateEl = document.getElementById('stat-rate');
  if (rate !== null) {
    rateEl.textContent = `${rate}%`;
    rateEl.className = `stat-value ${rate >= 60 ? 'color-green' : rate >= 45 ? 'color-orange' : 'color-red'}`;
  } else {
    rateEl.textContent = '—';
  }

  const historyEl = document.getElementById('history-list');

  if (games.length === 0) {
    historyEl.innerHTML = `<div class="empty-state">No games logged yet.</div>`;
    return;
  }

  historyEl.innerHTML = games.map(row => {
    const g = row.games;
    const resultClass = row.won ? 'win' : 'loss';
    const resultBadge = row.won
      ? `<span class="badge badge-win">Win</span>`
      : `<span class="badge badge-loss">Loss</span>`;
    const teamBadge = `<span class="badge badge-${row.team}">${row.team} team</span>`;
    const roleBadge = `<span class="badge" style="background:var(--surface2);border:1px solid var(--border)">${row.role}</span>`;

    const screenshotLink = g.screenshot_url
      ? `<a href="${escapeHtml(g.screenshot_url)}" target="_blank" rel="noopener" class="screenshot-link">View screenshot</a>`
      : '';

    const notes = g.notes
      ? `<div class="game-notes">${escapeHtml(g.notes)}</div>`
      : '';

    return `
      <div class="game-item">
        <div class="game-result-bar ${resultClass}"></div>
        <div class="game-info">
          <div class="game-date">${formatDateTime(g.created_at)}</div>
          <div class="game-details">
            ${resultBadge}
            ${teamBadge}
            ${roleBadge}
            ${screenshotLink}
          </div>
          ${notes}
        </div>
      </div>
    `;
  }).join('');
}

loadPlayer();
