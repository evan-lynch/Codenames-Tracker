let activeTab = 'signin';

async function init() {
  const { data: { session } } = await db.auth.getSession();
  if (session) {
    window.location.href = 'index.html';
    return;
  }

  document.getElementById('tab-signin').addEventListener('click', () => switchTab('signin'));
  document.getElementById('tab-signup').addEventListener('click', () => switchTab('signup'));
  document.getElementById('signin-form').addEventListener('submit', handleSignIn);
  document.getElementById('signup-form').addEventListener('submit', handleSignUp);
}

function switchTab(tab) {
  activeTab = tab;
  document.getElementById('tab-signin').classList.toggle('active', tab === 'signin');
  document.getElementById('tab-signup').classList.toggle('active', tab === 'signup');
  document.getElementById('signin-form').style.display = tab === 'signin' ? 'block' : 'none';
  document.getElementById('signup-form').style.display = tab === 'signup' ? 'block' : 'none';
  clearMessages();
}

async function handleSignIn(e) {
  e.preventDefault();
  clearMessages();
  const email = document.getElementById('signin-email').value;
  const password = document.getElementById('signin-password').value;

  const btn = document.getElementById('signin-btn');
  btn.disabled = true;
  btn.textContent = 'Signing in...';

  const { error } = await db.auth.signInWithPassword({ email, password });

  if (error) {
    showError('signin-error', error.message);
    btn.disabled = false;
    btn.textContent = 'Sign In';
    return;
  }

  window.location.href = 'index.html';
}

async function handleSignUp(e) {
  e.preventDefault();
  clearMessages();

  const email = document.getElementById('signup-email').value;
  const password = document.getElementById('signup-password').value;
  const username = document.getElementById('signup-username').value.trim();

  if (username.length < 2 || username.length > 20) {
    showError('signup-error', 'Username must be 2–20 characters.');
    return;
  }

  if (!/^[a-zA-Z0-9_]+$/.test(username)) {
    showError('signup-error', 'Username can only contain letters, numbers, and underscores.');
    return;
  }

  const btn = document.getElementById('signup-btn');
  btn.disabled = true;
  btn.textContent = 'Creating account...';

  const { data: existing } = await db
    .from('profiles')
    .select('id')
    .eq('username', username)
    .maybeSingle();

  if (existing) {
    showError('signup-error', 'That username is already taken.');
    btn.disabled = false;
    btn.textContent = 'Create Account';
    return;
  }

  const { data, error } = await db.auth.signUp({ email, password });

  if (error) {
    showError('signup-error', error.message);
    btn.disabled = false;
    btn.textContent = 'Create Account';
    return;
  }

  if (data.user) {
    const { error: profileError } = await db
      .from('profiles')
      .insert({ id: data.user.id, username });

    if (profileError) {
      showError('signup-error', 'Account created but profile setup failed: ' + profileError.message);
      btn.disabled = false;
      btn.textContent = 'Create Account';
      return;
    }

    window.location.href = 'index.html';
  }
}

function showError(id, msg) {
  const el = document.getElementById(id);
  el.textContent = msg;
  el.style.display = 'block';
}

function clearMessages() {
  ['signin-error', 'signup-error'].forEach(id => {
    const el = document.getElementById(id);
    el.textContent = '';
    el.style.display = 'none';
  });
}

init();
