async function loadLeaderboard() {
  const tbody = document.getElementById('leaderboard-body');

  const { data, error } = await db
    .from('leaderboard')
    .select('*')
    .order('wins', { ascending: false })
    .order('games_played', { ascending: false });

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

    return `
      <tr>
        <td class="rank ${rankClass}">${rankLabel}</td>
        <td><a class="player-link" href="player.html?id=${row.id}">${escapeHtml(row.username)}</a></td>
        <td class="wins-count">${row.wins}</td>
        <td class="stat">${row.losses}</td>
        <td class="win-rate ${row.games_played > 0 ? rateClass : ''}">${rateDisplay}</td>
      </tr>
    `;
  }).join('');
}

function escapeHtml(str) {
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}

initAuth().then(loadLeaderboard);
