function escapeHtml(str) {
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}

function renderProfileSidebar(profile, stats) {
  const sidebar = document.getElementById('profile-sidebar');
  if (!sidebar) return;

  if (!profile) {
    sidebar.innerHTML = `
      <div class="profile-card">
        <p class="profile-guest-msg">Sign in to track your stats and log games</p>
        <a href="login.html" class="btn btn-primary" style="width:100%; text-align:center; padding:12px">Sign In</a>
      </div>
    `;
    return;
  }

  const wins = stats?.wins ?? 0;
  const losses = stats?.losses ?? 0;
  const games = stats?.games_played ?? 0;
  const rate = games > 0 ? Math.round((wins / games) * 100) : null;
  const rateClass = rate === null ? '' : rate >= 60 ? 'color-green' : rate >= 45 ? 'color-orange' : 'color-red';

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
    <a href="log.html" class="btn btn-primary profile-log-btn">+ Log Game</a>
    <a href="player.html?id=${profile.id}" class="btn btn-ghost profile-view-btn">View My Profile</a>
  `;
}

async function loadLeaderboard() {
  const { user, profile } = await initAuth();

  const { data, error } = await db
    .from('leaderboard')
    .select('*')
    .order('wins', { ascending: false })
    .order('games_played', { ascending: false });

  const myStats = profile && data
    ? data.find(r => r.id === profile.id)
    : null;

  renderProfileSidebar(profile, myStats);

  const tbody = document.getElementById('leaderboard-body');

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
    const rateDisplay = row.games_played > 0 ? `${rate}%` : '—';

    const isMe = profile && row.id === profile.id;

    return `
      <tr ${isMe ? 'class="my-row"' : ''}>
        <td class="rank ${rankClass}">${rankLabel}</td>
        <td><a class="player-link" href="player.html?id=${row.id}">${escapeHtml(row.username)}${isMe ? ' <span class="you-badge">you</span>' : ''}</a></td>
        <td class="wins-count">${row.wins}</td>
        <td class="stat">${row.losses}</td>
        <td class="win-rate ${row.games_played > 0 ? rateClass : ''}">${rateDisplay}</td>
      </tr>
    `;
  }).join('');
}

loadLeaderboard();
