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
    const adminBadge = currentProfile.is_admin
      ? `<span class="nav-admin-badge">Admin</span>`
      : '';
    el.innerHTML = `
      <span class="nav-user">${currentProfile.username}${adminBadge}</span>
      <button class="btn btn-ghost btn-sm" onclick="signOut()">Sign Out</button>
    `;
  } else {
    const isMobile = /Android|iPhone|iPad|iPod|IEMobile|Opera Mini/i.test(navigator.userAgent);
    if (!isMobile) {
      el.innerHTML = `<a href="login.html" class="btn btn-ghost btn-sm">Sign In</a>`;
    }
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
