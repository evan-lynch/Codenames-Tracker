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

// ── Module state ─────────────────────────────────
let cachedAllPlays = null;
let cachedLeaderboardData = null;
let cachedProfile = null;
let activeLeaderboardTab = 'players';

// ── Shared data fetch ────────────────────────────

async function fetchAllPlays() {
  const { data } = await db
    .from('game_players')
    .select('game_id, player_id, team, role, won, profiles(id, username)');
  return data ?? [];
}

function computeBestTeammate(allPlays, myId) {
  const myGameTeam = {}, myGameWon = {};
  for (const p of allPlays) {
    if (p.player_id === myId) { myGameTeam[p.game_id] = p.team; myGameWon[p.game_id] = p.won; }
  }
  const mateMap = {};
  for (const p of allPlays) {
    if (p.player_id === myId) continue;
    if (myGameTeam[p.game_id] !== p.team) continue;
    const id = p.player_id;
    if (!mateMap[id]) mateMap[id] = { id, wins: 0, total: 0, name: p.profiles?.username ?? '?' };
    mateMap[id].total++;
    if (myGameWon[p.game_id]) mateMap[id].wins++;
  }
  const mates = Object.values(mateMap).filter(m => m.total >= 2);
  if (!mates.length) return null;
  return mates
    .map(m => ({ ...m, rate: Math.round(m.wins / m.total * 100) }))
    .sort((a, b) => b.rate - a.rate || b.wins - a.wins)[0];
}

function computeBestTeams(allPlays) {
  const gameTeams = {};
  for (const p of allPlays) {
    const key = `${p.game_id}:${p.team}`;
    if (!gameTeams[key]) gameTeams[key] = [];
    gameTeams[key].push(p);
  }
  const teamMap = {};
  for (const players of Object.values(gameTeams)) {
    if (players.length < 2) continue;
    const sorted = [...players].sort((a, b) => a.player_id.localeCompare(b.player_id));
    const key = sorted.map(p => p.player_id).join('|');
    if (!teamMap[key]) teamMap[key] = { wins: 0, total: 0, names: sorted.map(p => p.profiles?.username ?? '?') };
    teamMap[key].total++;
    if (players[0].won) teamMap[key].wins++;
  }
  return Object.values(teamMap)
    .filter(t => t.total >= 2)
    .map(t => ({ ...t, rate: Math.round(t.wins / t.total * 100) }))
    .sort((a, b) => b.rate - a.rate || b.wins - a.wins)
    ;
}

function renderBestTeams(teams) {
  const container = document.getElementById('best-teams-list');
  if (!container) return;
  if (teams.length === 0) {
    container.innerHTML = `<div class="empty-state" style="padding:20px">Need at least 2 games together to appear here.</div>`;
    return;
  }
  container.innerHTML = teams.map((t, i) => {
    const rateClass = t.rate >= 60 ? 'color-green' : t.rate >= 45 ? 'color-orange' : 'color-red';
    return `
      <div class="best-team-row">
        <span class="best-team-rank">${i + 1}</span>
        <span class="best-team-names">${t.names.map(n => escapeHtml(n)).join(' &amp; ')}</span>
        <span class="best-team-rate ${rateClass}">${t.rate}%</span>
      </div>`;
  }).join('');
}

// ── Profile Sidebar ──────────────────────────────

function roleRateHtml(wins, total) {
  if (total === 0) return '—';
  const pct = Math.round(wins / total * 100);
  const cls = pct >= 60 ? 'color-green' : pct >= 45 ? 'color-orange' : 'color-red';
  return `<span class="${cls}">${pct}%</span> <span style="font-size:0.65rem;color:var(--text-muted)">${wins}/${total}</span>`;
}

function renderProfileSidebar(profile, stats, roleStats, bestTeammate) {
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
    ${bestTeammate ? `
    <div class="profile-best-mate">
      <div class="profile-role-label">Best Teammate</div>
      <div class="profile-role-value">
        <a href="player.html?id=${bestTeammate.id}" style="text-decoration:none;font-weight:700;color:var(--blue-bright)">${escapeHtml(bestTeammate.name)}</a>
        <span style="font-size:0.65rem;color:var(--text-muted)">${bestTeammate.rate}% · ${bestTeammate.wins}/${bestTeammate.total}</span>
      </div>
    </div>` : ''}
    <a href="log.html" class="btn btn-primary profile-log-btn">+ Log Game</a>
    <a href="player.html?id=${profile.id}" class="btn btn-ghost profile-view-btn">View My Profile</a>
  `;
}

// ── Leaderboard ──────────────────────────────────

function renderPlayersTable(data, profile) {
  document.getElementById('leaderboard-thead').innerHTML = `<tr><th>#</th><th>Player</th><th>Points</th><th>Wins</th><th>Losses</th><th>Win Rate</th></tr>`;
  const tbody = document.getElementById('leaderboard-body');
  if (!data || data.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" class="empty-state">No games logged yet. Be the first!</td></tr>`;
    return;
  }
  const sorted = [...data]
    .map(r => ({ ...r, elo: Math.max(0, r.wins - r.losses) }))
    .sort((a, b) => b.elo - a.elo || b.wins - a.wins);

  tbody.innerHTML = sorted.map((row, i) => {
    const rank = i + 1;
    const rankClass = rank <= 3 ? `rank-${rank}` : '';
    const rankLabel = rank === 1 ? '1st' : rank === 2 ? '2nd' : rank === 3 ? '3rd' : `${rank}th`;
    const isMe = profile && row.id === profile.id;
    const eloClass = row.elo > 0 ? 'color-green' : 'color-red';
    const rate = Number(row.win_rate);
    const rateClass = rate >= 60 ? 'win-rate-high' : rate >= 45 ? 'win-rate-mid' : 'win-rate-low';
    return `
      <tr ${isMe ? 'class="my-row"' : ''} onclick="window.location='player.html?id=${row.id}'">
        <td class="rank ${rankClass}">${rankLabel}</td>
        <td><a class="player-link" href="player.html?id=${row.id}">${escapeHtml(row.username)}${isMe ? ' <span class="you-badge">you</span>' : ''}</a></td>
        <td class="elo-score ${eloClass}">${row.elo}</td>
        <td class="wins-count">${row.wins}</td>
        <td class="losses-count">${row.losses}</td>
        <td class="win-rate ${row.games_played > 0 ? rateClass : ''}">${row.games_played > 0 ? rate + '%' : '—'}</td>
      </tr>`;
  }).join('');
}

function renderTeamsTable(allPlays) {
  document.getElementById('leaderboard-thead').innerHTML = `<tr><th>#</th><th>Team</th><th>Points</th><th>Wins</th><th>Losses</th><th>Win Rate</th></tr>`;
  const tbody = document.getElementById('leaderboard-body');
  const teams = computeBestTeams(allPlays)
    .map(t => ({ ...t, losses: t.total - t.wins, elo: Math.max(0, t.wins - (t.total - t.wins)) }))
    .sort((a, b) => b.elo - a.elo || b.wins - a.wins);

  if (teams.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" class="empty-state">Need 2+ games per team combo to appear here.</td></tr>`;
    return;
  }
  tbody.innerHTML = teams.map((t, i) => {
    const rank = i + 1;
    const rankClass = rank <= 3 ? `rank-${rank}` : '';
    const rankLabel = rank === 1 ? '1st' : rank === 2 ? '2nd' : rank === 3 ? '3rd' : `${rank}th`;
    const eloClass = t.elo > 0 ? 'color-green' : 'color-red';
    const rateClass = t.rate >= 60 ? 'win-rate-high' : t.rate >= 45 ? 'win-rate-mid' : 'win-rate-low';
    return `
      <tr>
        <td class="rank ${rankClass}">${rankLabel}</td>
        <td style="font-weight:600">${t.names.map(n => escapeHtml(n)).join(' &amp; ')}</td>
        <td class="elo-score ${eloClass}">${t.elo}</td>
        <td class="wins-count">${t.wins}</td>
        <td class="losses-count">${t.losses}</td>
        <td class="win-rate ${t.total > 0 ? rateClass : ''}">${t.total > 0 ? t.rate + '%' : '—'}</td>
      </tr>`;
  }).join('');
}

function renderRoleTable(allPlays, role) {
  document.getElementById('leaderboard-thead').innerHTML = `<tr><th>#</th><th>Player</th><th>Points</th><th>Wins</th><th>Losses</th><th>Win Rate</th></tr>`;
  const tbody = document.getElementById('leaderboard-body');

  const playerMap = {};
  for (const p of allPlays) {
    if (p.role !== role) continue;
    const id = p.player_id;
    if (!playerMap[id]) playerMap[id] = { id, name: p.profiles?.username ?? '?', wins: 0, losses: 0 };
    if (p.won) playerMap[id].wins++;
    else playerMap[id].losses++;
  }

  const rows = Object.values(playerMap)
    .map(r => ({ ...r, total: r.wins + r.losses, elo: Math.max(0, r.wins - r.losses) }))
    .sort((a, b) => b.elo - a.elo || b.wins - a.wins);

  if (rows.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" class="empty-state">No games logged yet.</td></tr>`;
    return;
  }

  tbody.innerHTML = rows.map((row, i) => {
    const rank = i + 1;
    const rankClass = rank <= 3 ? `rank-${rank}` : '';
    const rankLabel = rank === 1 ? '1st' : rank === 2 ? '2nd' : rank === 3 ? '3rd' : `${rank}th`;
    const isMe = cachedProfile && row.id === cachedProfile.id;
    const eloClass = row.elo > 0 ? 'color-green' : 'color-red';
    const rate = row.total > 0 ? Math.round(row.wins / row.total * 100) : 0;
    const rateClass = rate >= 60 ? 'win-rate-high' : rate >= 45 ? 'win-rate-mid' : 'win-rate-low';
    return `
      <tr ${isMe ? 'class="my-row"' : ''} onclick="window.location='player.html?id=${row.id}'">
        <td class="rank ${rankClass}">${rankLabel}</td>
        <td><a class="player-link" href="player.html?id=${row.id}">${escapeHtml(row.name)}${isMe ? ' <span class="you-badge">you</span>' : ''}</a></td>
        <td class="elo-score ${eloClass}">${row.elo}</td>
        <td class="wins-count">${row.wins}</td>
        <td class="losses-count">${row.losses}</td>
        <td class="win-rate ${row.total > 0 ? rateClass : ''}">${row.total > 0 ? rate + '%' : '—'}</td>
      </tr>`;
  }).join('');
}

function setupLeaderboardToggle() {
  const tabs = [
    { id: 'toggle-players',   key: 'players' },
    { id: 'toggle-teams',     key: 'teams' },
    { id: 'toggle-spymaster', key: 'spymaster' },
    { id: 'toggle-operative', key: 'operative' },
  ];

  const btns = tabs.map(t => document.getElementById(t.id)).filter(Boolean);

  function activate(key) {
    activeLeaderboardTab = key;
    btns.forEach(b => b.classList.remove('active'));
    document.getElementById(`toggle-${key}`)?.classList.add('active');
    if (key === 'players')   renderPlayersTable(cachedLeaderboardData, cachedProfile);
    else if (key === 'teams') renderTeamsTable(cachedAllPlays);
    else                      renderRoleTable(cachedAllPlays, key);
  }

  tabs.forEach(t => {
    document.getElementById(t.id)?.addEventListener('click', () => activate(t.key));
  });
}

async function loadLeaderboard(profile, allPlays) {
  cachedProfile = profile;
  cachedAllPlays = allPlays;

  const { data, error } = await db
    .from('leaderboard')
    .select('*')
    .order('wins', { ascending: false })
    .order('games_played', { ascending: false });

  cachedLeaderboardData = error ? null : data;

  const myStats = profile && data ? data.find(r => r.id === profile.id) : null;

  let roleStats = null;
  let bestTeammate = null;
  if (profile && allPlays) {
    const myPlays = allPlays.filter(p => p.player_id === profile.id);
    const sm = myPlays.filter(p => p.role === 'spymaster');
    const op = myPlays.filter(p => p.role === 'operative');
    roleStats = {
      smTotal: sm.length, smWins: sm.filter(p => p.won).length,
      opTotal: op.length, opWins: op.filter(p => p.won).length,
    };
    bestTeammate = computeBestTeammate(allPlays, profile.id);
  }

  renderProfileSidebar(profile, myStats, roleStats, bestTeammate);

  if (error) {
    document.getElementById('leaderboard-body').innerHTML =
      `<tr><td colspan="5" class="empty-state">Failed to load leaderboard.</td></tr>`;
    return;
  }

  if (activeLeaderboardTab === 'teams') {
    renderTeamsTable(allPlays);
  } else {
    renderPlayersTable(data, profile);
  }
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
  setTimeout(async () => {
    cardEl.remove();
    const list = document.getElementById('game-history-list');
    if (list && !list.querySelector('.history-game-card')) {
      list.innerHTML = `<div class="empty-state">No games logged yet.</div>`;
    }
    const plays = await fetchAllPlays();
    cachedAllPlays = plays;
    loadLeaderboard(currentProfile, plays);
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
    .limit(3);

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

    const winTeam  = game.winning_team;
    const loseTeam = winTeam === 'red' ? 'blue' : 'red';
    const winPlayers  = game.game_players.filter(p => p.team === winTeam);
    const losePlayers = game.game_players.filter(p => p.team === loseTeam);

    function compact(players) {
      return players.map(p => {
        const name = p.profiles?.username ?? '?';
        const role = p.role === 'spymaster' ? 'SM' : 'Op';
        return `<span class="history-compact-player ${p.won ? 'player-win' : 'player-loss'}">${escapeHtml(name)} <em>${role}</em></span>`;
      }).join('');
    }

    const ssIcon = game.screenshot_url
      ? `<a href="${escapeHtml(game.screenshot_url)}" target="_blank" rel="noopener" class="history-ss-icon" title="View screenshot"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>↗</a>`
      : '';

    const editBtn = isOwner
      ? `<a href="edit.html?id=${game.id}" class="btn-edit-game">Edit</a>`
      : '';
    const removeBtn = isOwner
      ? `<button class="btn-remove-game" onclick="deleteGameInline('${game.id}', ${game.screenshot_url ? `'${escapeHtml(game.screenshot_url)}'` : 'null'}, this.closest('.history-game-card'))">Remove</button>`
      : '';

    const cardFooter = (editBtn || removeBtn)
      ? `<div class="history-card-footer">${editBtn}${removeBtn}</div>`
      : '';

    return `
      <div class="history-game-card" data-id="${game.id}">
        <div class="history-game-header">
          <span class="history-game-date">${formatDateTime(game.created_at)}${ssIcon}</span>
          ${winBadge}
        </div>
        <div class="history-teams">
          <div class="history-team history-team-${winTeam}">${compact(winPlayers)}</div>
          <div class="history-team history-team-${loseTeam}">${compact(losePlayers)}</div>
        </div>
        ${cardFooter}
      </div>`;
  }).join('');
}

// ── Clue Hall of Fame Preview ────────────────────

async function loadClueHOF() {
  const container = document.getElementById('clue-hof-preview');
  if (!container) return;

  const { data, error } = await db
    .from('clues')
    .select('id, screenshot_url, created_at, profiles(username)')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) {
    container.innerHTML = `<div class="empty-state" style="padding:16px">No clues yet. <a href="clues.html" style="color:var(--orange)">Be the first to upload one.</a></div>`;
    return;
  }

  container.innerHTML = `
    <a href="${escapeHtml(data.screenshot_url)}" target="_blank" rel="noopener" class="clue-hof-preview-link">
      <img src="${escapeHtml(data.screenshot_url)}" alt="Clue" class="clue-hof-img">
    </a>
    <div class="clue-hof-meta">By <strong>${escapeHtml(data.profiles?.username ?? '?')}</strong> · ${formatDateTime(data.created_at)}</div>
  `;
}

// ── Init ─────────────────────────────────────────

async function init() {
  const { user, profile } = await initAuth();
  const allPlays = await fetchAllPlays();
  setupLeaderboardToggle();
  await Promise.all([
    loadLeaderboard(profile, allPlays),
    loadGameHistory(user?.id),
  ]);
}

init();
