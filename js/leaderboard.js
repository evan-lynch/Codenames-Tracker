function escapeHtml(str) {
  const d = document.createElement('div');
  d.textContent = str ?? '';
  return d.innerHTML;
}

function formatDateTime(isoStr) {
  return new Date(isoStr).toLocaleString('en-US', {
    month: 'short', day: 'numeric',
    hour: 'numeric', minute: '2-digit'
  });
}

// ── Profile Sidebar ──────────────────────────────

function roleRateHtml(wins, total) {
  if (total === 0) return '—';
  const pct = Math.round(wins / total * 100);
  const cls = pct >= 60 ? 'color-green' : pct >= 45 ? 'color-orange' : 'color-red';
  return `<span class="${cls}">${pct}%</span> <span style="font-size:0.65rem;color:var(--text-muted)">${wins}/${total}</span>`;
}

function renderProfileSidebar(profile, stats, roleStats) {
  const sidebar = document.getElementById('profile-sidebar');
  if (!sidebar) return;

  if (!profile) {
    sidebar.innerHTML = `
      <p class="profile-guest-msg">Sign in to track your stats and log games</p>
      <a href="login.html" class="btn btn-primary" style="width:100%;text-align:center;padding:12px;display:block">Sign In</a>
    `;
    return;
  }

  const wins   = stats?.wins ?? 0;
  const losses = stats?.losses ?? 0;
  const games  = stats?.games_played ?? 0;
  const rate   = games > 0 ? Math.round((wins / games) * 100) : null;
  const rateClass = rate === null ? '' : rate >= 60 ? 'color-green' : rate >= 45 ? 'color-orange' : 'color-red';

  const smWins = roleStats?.smWins ?? 0;
  const smTotal = roleStats?.smTotal ?? 0;
  const opWins = roleStats?.opWins ?? 0;
  const opTotal = roleStats?.opTotal ?? 0;

  sidebar.innerHTML = `
    <div class="profile-avatar">${escapeHtml(profile.username.charAt(0).toUpperCase())}</div>
    <div class="profile-username">${escapeHtml(profile.username)}</div>
    <div class="profile-stats">
      <div class="profile-stat">
        <div class="profile-stat-value color-green">${wins}</div>
        <div class="profile-stat-label">Wins</div>
      </div>
      <div class="profile-stat">
        <div class="profile-stat-value color-red">${losses}</div>
        <div class="profile-stat-label">Losses</div>
      </div>
      <div class="profile-stat">
        <div class="profile-stat-value ${rateClass}">${rate !== null ? rate + '%' : '—'}</div>
        <div class="profile-stat-label">Win Rate</div>
      </div>
    </div>
    <div class="profile-role-stats">
      <div class="profile-role-stat">
        <div class="profile-role-label">Spymaster</div>
        <div class="profile-role-value">${roleRateHtml(smWins, smTotal)}</div>
      </div>
      <div class="profile-role-stat">
        <div class="profile-role-label">Operative</div>
        <div class="profile-role-value">${roleRateHtml(opWins, opTotal)}</div>
      </div>
    </div>
    <a href="log.html" class="btn btn-primary profile-log-btn">+ Log Game</a>
    <a href="player.html?id=${profile.id}" class="btn btn-ghost profile-view-btn">View My Profile</a>
  `;
}

// ── Leaderboard ──────────────────────────────────

async function loadLeaderboard(profile) {
  const tbody = document.getElementById('leaderboard-body');

  const { data, error } = await db
    .from('leaderboard')
    .select('*')
    .order('wins', { ascending: false })
    .order('games_played', { ascending: false });

  const myStats = profile && data ? data.find(r => r.id === profile.id) : null;

  let roleStats = null;
  if (profile) {
    const { data: rolePlays } = await db
      .from('game_players')
      .select('role, won')
      .eq('player_id', profile.id);
    if (rolePlays) {
      const sm = rolePlays.filter(p => p.role === 'spymaster');
      const op = rolePlays.filter(p => p.role === 'operative');
      roleStats = {
        smTotal: sm.length, smWins: sm.filter(p => p.won).length,
        opTotal: op.length, opWins: op.filter(p => p.won).length,
      };
    }
  }

  renderProfileSidebar(profile, myStats, roleStats);

  if (error || !data) {
    tbody.innerHTML = `<tr><td colspan="5" class="empty-state">Failed to load leaderboard.</td></tr>`;
    return;
  }
  if (data.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" class="empty-state">No games logged yet. Be the first!</td></tr>`;
    return;
  }

  tbody.innerHTML = data.map((row, i) => {
    const rank = i + 1;
    const rankClass = rank <= 3 ? `rank-${rank}` : '';
    const rankLabel = rank === 1 ? '1st' : rank === 2 ? '2nd' : rank === 3 ? '3rd' : `${rank}th`;
    const rate = Number(row.win_rate);
    const rateClass = rate >= 60 ? 'win-rate-high' : rate >= 45 ? 'win-rate-mid' : 'win-rate-low';
    const isMe = profile && row.id === profile.id;

    return `
      <tr ${isMe ? 'class="my-row"' : ''}>
        <td class="rank ${rankClass}">${rankLabel}</td>
        <td><a class="player-link" href="player.html?id=${row.id}">${escapeHtml(row.username)}${isMe ? ' <span class="you-badge">you</span>' : ''}</a></td>
        <td class="wins-count">${row.wins}</td>
        <td class="stat">${row.losses}</td>
        <td class="win-rate ${row.games_played > 0 ? rateClass : ''}">${row.games_played > 0 ? rate + '%' : '—'}</td>
      </tr>`;
  }).join('');
}

// ── Game History Panel ───────────────────────────

async function deleteGameInline(gameId, screenshotUrl, cardEl) {
  if (!confirm('Remove this game? This will update everyone\'s stats.')) return;
  const btn = cardEl.querySelector('.btn-remove-game');
  if (btn) { btn.disabled = true; btn.textContent = 'Removing...'; }

  if (screenshotUrl) {
    const parts = screenshotUrl.split('/screenshots/');
    if (parts[1]) await db.storage.from('screenshots').remove([parts[1]]);
  }

  const { error } = await db.from('games').delete().eq('id', gameId);
  if (error) {
    alert('Failed to remove: ' + error.message);
    if (btn) { btn.disabled = false; btn.textContent = 'Remove'; }
    return;
  }

  cardEl.style.opacity = '0';
  cardEl.style.transition = 'opacity 0.2s';
  setTimeout(() => {
    cardEl.remove();
    const list = document.getElementById('game-history-list');
    if (list && !list.querySelector('.history-game-card')) {
      list.innerHTML = `<div class="empty-state">No games logged yet.</div>`;
    }
    // Reload leaderboard stats silently
    loadLeaderboard(currentProfile);
  }, 200);
}

async function loadGameHistory(userId) {
  const container = document.getElementById('game-history-list');

  const { data: games, error } = await db
    .from('games')
    .select(`
      id, winning_team, screenshot_url, created_by, created_at,
      game_players (
        team, role, won,
        profiles ( id, username )
      )
    `)
    .order('created_at', { ascending: false })
    .limit(30);

  if (error || !games) {
    container.innerHTML = `<div class="empty-state">Failed to load.</div>`;
    return;
  }
  if (games.length === 0) {
    container.innerHTML = `<div class="empty-state">No games logged yet.</div>`;
    return;
  }

  container.innerHTML = games.map(game => {
    const isOwner = userId && game.created_by === userId;
    const winBadge = game.winning_team === 'red'
      ? `<span class="badge badge-red" style="font-size:0.6rem">Red Win</span>`
      : `<span class="badge badge-blue" style="font-size:0.6rem">Blue Win</span>`;

    const redPlayers  = game.game_players.filter(p => p.team === 'red');
    const bluePlayers = game.game_players.filter(p => p.team === 'blue');

    function compact(players) {
      return players.map(p => {
        const name = p.profiles?.username ?? '?';
        const role = p.role === 'spymaster' ? 'SM' : 'Op';
        const result = p.won ? 'W' : 'L';
        return `<span class="history-compact-player ${p.won ? 'player-win' : 'player-loss'}">${escapeHtml(name)} <em>${role} · ${result}</em></span>`;
      }).join('');
    }

    const ssLink = game.screenshot_url
      ? `<a href="${escapeHtml(game.screenshot_url)}" target="_blank" rel="noopener" class="screenshot-link" style="font-size:0.7rem">Screenshot</a>`
      : '';

    const removeBtn = isOwner
      ? `<button class="btn-remove-game" style="font-size:0.68rem;padding:3px 10px" onclick="deleteGameInline('${game.id}', ${game.screenshot_url ? `'${escapeHtml(game.screenshot_url)}'` : 'null'}, this.closest('.history-game-card'))">Remove</button>`
      : '';

    return `
      <div class="history-game-card" data-id="${game.id}">
        <div class="history-game-header">
          <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
            <span class="history-game-date">${formatDateTime(game.created_at)}</span>
            ${winBadge}
            ${ssLink}
          </div>
          ${removeBtn}
        </div>
        <div class="history-teams">
          <div class="history-team history-team-red">${compact(redPlayers)}</div>
          <div class="history-team history-team-blue">${compact(bluePlayers)}</div>
        </div>
      </div>`;
  }).join('');
}

// ── Init ─────────────────────────────────────────

async function init() {
  const { user, profile } = await initAuth();
  await Promise.all([
    loadLeaderboard(profile),
    loadGameHistory(user?.id),
  ]);
}

init();
