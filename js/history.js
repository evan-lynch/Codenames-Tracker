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

function storageFilename(url) {
  const parts = url.split('/screenshots/');
  return parts.length > 1 ? parts[1] : null;
}

async function deleteGame(gameId, screenshotUrl, btnEl) {
  if (!confirm('Remove this game? This will update everyone\'s stats.')) return;

  btnEl.disabled = true;
  btnEl.textContent = 'Removing...';

  if (screenshotUrl) {
    const filename = storageFilename(screenshotUrl);
    if (filename) await db.storage.from('screenshots').remove([filename]);
  }

  const { error } = await db.from('games').delete().eq('id', gameId);

  if (error) {
    alert('Failed to remove game: ' + error.message);
    btnEl.disabled = false;
    btnEl.textContent = 'Remove';
    return;
  }

  document.getElementById(`game-${gameId}`)?.remove();

  const remaining = document.querySelectorAll('.game-card');
  if (remaining.length === 0) {
    document.getElementById('history-container').innerHTML =
      `<div class="empty-state">No games logged yet.</div>`;
  }
}

async function loadHistory() {
  const { user, profile } = await initAuth();

  const { data: games, error } = await db
    .from('games')
    .select(`
      id, played_at, winning_team, screenshot_url, notes, created_by, created_at,
      game_players (
        player_id, team, role, won,
        profiles ( id, username )
      )
    `)
    .order('created_at', { ascending: false });

  const container = document.getElementById('history-container');

  if (error || !games) {
    container.innerHTML = `<div class="empty-state">Failed to load game history.</div>`;
    return;
  }

  if (games.length === 0) {
    container.innerHTML = `<div class="empty-state">No games logged yet.</div>`;
    return;
  }

  container.innerHTML = games.map(game => {
    const isOwner = user && game.created_by === user.id;
    const winBadge = game.winning_team === 'red'
      ? `<span class="badge badge-red">Red Wins</span>`
      : `<span class="badge badge-blue">Blue Wins</span>`;

    const redPlayers = game.game_players.filter(p => p.team === 'red');
    const bluePlayers = game.game_players.filter(p => p.team === 'blue');

    function playerRow(p) {
      const name = p.profiles?.username ?? 'Unknown';
      const resultBadge = p.won
        ? `<span class="badge badge-win">W</span>`
        : `<span class="badge badge-loss">L</span>`;
      const roleBadge = `<span class="badge" style="background:var(--surface2);border:1px solid var(--border);text-transform:capitalize">${p.role}</span>`;
      return `
        <div class="history-player-row">
          <span class="history-player-name">${escapeHtml(name)}</span>
          <div style="display:flex;gap:6px;align-items:center">${roleBadge}${resultBadge}</div>
        </div>`;
    }

    const screenshotBtn = game.screenshot_url
      ? `<a href="${escapeHtml(game.screenshot_url)}" target="_blank" rel="noopener" class="screenshot-link">View screenshot</a>`
      : '';

    const notesHtml = game.notes
      ? `<div class="game-notes" style="margin-top:12px">${escapeHtml(game.notes)}</div>`
      : '';

    const deleteBtn = isOwner
      ? `<button class="btn-remove-game" onclick="deleteGame('${game.id}', ${game.screenshot_url ? `'${escapeHtml(game.screenshot_url)}'` : 'null'}, this)">Remove</button>`
      : '';

    return `
      <div class="game-card" id="game-${game.id}">
        <div class="game-card-header">
          <div class="game-card-meta">
            <span class="game-card-date">${formatDateTime(game.created_at)}</span>
            ${winBadge}
            ${screenshotBtn}
          </div>
          ${deleteBtn}
        </div>

        <div class="game-card-teams">
          <div class="game-card-team">
            <div class="team-label red-label">Red Team</div>
            ${redPlayers.map(playerRow).join('')}
          </div>
          <div class="game-card-team">
            <div class="team-label blue-label">Blue Team</div>
            ${bluePlayers.map(playerRow).join('')}
          </div>
        </div>

        ${notesHtml}
      </div>
    `;
  }).join('');
}

loadHistory();
