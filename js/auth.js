let currentUser = null;
let currentProfile = null;

async function initAuth() {
  const { data: { session } } = await db.auth.getSession();
  if (session) {
    currentUser = session.user;
    const { data } = await db.from('profiles').select('*').eq('id', currentUser.id).single();
    currentProfile = data;
  }
  renderNav();
  return { user: currentUser, profile: currentProfile };
}

function renderNav() {
  const el = document.getElementById('nav-links');
  if (!el) return;

  if (currentUser && currentProfile) {
    el.innerHTML = `
      <a href="log.html" class="btn btn-primary btn-sm">+ Log Game</a>
      <span class="nav-user">${currentProfile.username}</span>
      <button class="btn btn-ghost btn-sm" onclick="signOut()">Sign Out</button>
    `;
  } else {
    el.innerHTML = `<a href="login.html" class="btn btn-ghost btn-sm">Sign In</a>`;
  }
}

async function signOut() {
  await db.auth.signOut();
  window.location.href = 'index.html';
}

function requireAuth() {
  if (!currentUser) {
    window.location.href = 'login.html';
    return false;
  }
  return true;
}
