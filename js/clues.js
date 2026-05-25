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

function compressImage(file, maxPx = 1920, quality = 0.8) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      let { width, height } = img;
      if (width > maxPx || height > maxPx) {
        if (width > height) { height = Math.round(height * maxPx / width); width = maxPx; }
        else { width = Math.round(width * maxPx / height); height = maxPx; }
      }
      const canvas = document.createElement('canvas');
      canvas.width = width; canvas.height = height;
      canvas.getContext('2d').drawImage(img, 0, 0, width, height);
      canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Compression failed')), 'image/jpeg', quality);
    };
    img.onerror = reject;
    img.src = url;
  });
}

let selectedFile = null;
let uploadFormVisible = false;

async function loadClues() {
  const grid = document.getElementById('clues-grid');

  let data, error;
  try {
    ({ data, error } = await db
      .from('clues')
      .select('id, screenshot_url, notes, created_at, uploaded_by, profiles(id, username)')
      .order('created_at', { ascending: false }));
  } catch (e) {
    grid.innerHTML = `<div class="empty-state">Error: ${e.message}</div>`;
    return;
  }

  if (error) {
    grid.innerHTML = `<div class="empty-state">Failed to load: ${error.message}</div>`;
    return;
  }
  if (!data || data.length === 0) {
    grid.innerHTML = `<div class="empty-state">No clues uploaded yet.</div>`;
    return;
  }

  grid.innerHTML = data.map(clue => {
    const isOwner = currentUser && (clue.uploaded_by === currentUser.id || currentProfile?.is_admin);
    const notesHtml = clue.notes
      ? `<div class="clue-card-notes-wrap"><div class="clue-card-notes">${escapeHtml(clue.notes)}</div></div>`
      : '';
    return `
      <div class="clue-card" data-id="${clue.id}">
        <a href="${escapeHtml(clue.screenshot_url)}" target="_blank" rel="noopener" class="clue-card-img-link">
          <img src="${escapeHtml(clue.screenshot_url)}" alt="Clue" class="clue-card-img" loading="lazy">
        </a>
        ${notesHtml}
        <div class="clue-card-footer">
          <span class="clue-card-meta">
            <a href="player.html?id=${clue.profiles?.id}" class="player-link">${escapeHtml(clue.profiles?.username ?? '?')}</a>
            · ${formatDateTime(clue.created_at)}
          </span>
          ${isOwner ? `<div style="display:flex;gap:8px;align-items:center">
            <button class="clue-edit-note-btn" onclick="startEditNote(this, '${clue.id}')">${clue.notes ? 'Edit Note' : 'Add Note'}</button>
            <button class="btn-remove-game" onclick="deleteClue('${clue.id}', '${escapeHtml(clue.screenshot_url)}', this.closest('.clue-card'))">Remove</button>
          </div>` : ''}
        </div>
      </div>`;
  }).join('');
}

async function deleteClue(clueId, screenshotUrl, cardEl) {
  if (!confirm('Remove this clue?')) return;
  const btn = cardEl.querySelector('.btn-remove-game');
  if (btn) { btn.disabled = true; btn.textContent = 'Removing...'; }

  const parts = screenshotUrl.split('/screenshots/');
  if (parts[1]) await db.storage.from('screenshots').remove([parts[1]]);

  const { error } = await db.from('clues').delete().eq('id', clueId);
  if (error) {
    alert('Failed to remove: ' + error.message);
    if (btn) { btn.disabled = false; btn.textContent = 'Remove'; }
    return;
  }

  cardEl.style.opacity = '0';
  cardEl.style.transition = 'opacity 0.2s';
  setTimeout(() => {
    cardEl.remove();
    const grid = document.getElementById('clues-grid');
    if (grid && !grid.querySelector('.clue-card')) {
      grid.innerHTML = `<div class="empty-state">No clues uploaded yet.</div>`;
    }
  }, 200);
}

function toggleUploadForm() {
  uploadFormVisible = !uploadFormVisible;
  document.getElementById('upload-form').style.display = uploadFormVisible ? 'block' : 'none';
  document.getElementById('upload-btn').textContent = uploadFormVisible ? 'Cancel' : '+ Upload Clue';
  if (!uploadFormVisible) resetForm();
}

function resetForm() {
  selectedFile = null;
  document.getElementById('clue-file').value = '';
  document.getElementById('clue-notes').value = '';
  document.getElementById('clue-preview-wrap').style.display = 'none';
  document.getElementById('upload-label-text').textContent = 'Click to choose a screenshot';
  document.getElementById('upload-error').style.display = 'none';
  const btn = document.getElementById('submit-clue-btn');
  btn.disabled = false;
  btn.textContent = 'Upload';
}

async function handleUpload() {
  const errorEl = document.getElementById('upload-error');
  errorEl.style.display = 'none';

  if (!selectedFile) {
    errorEl.textContent = 'Please choose a screenshot first.';
    errorEl.style.display = 'block';
    return;
  }

  const btn = document.getElementById('submit-clue-btn');
  btn.disabled = true;
  btn.textContent = 'Uploading...';

  try {
    const blob = await compressImage(selectedFile);
    const ext = 'jpg';
    const path = `clues/${crypto.randomUUID()}.${ext}`;

    const { error: uploadError } = await db.storage.from('screenshots').upload(path, blob, { contentType: 'image/jpeg' });
    if (uploadError) throw uploadError;

    const { data: { publicUrl } } = db.storage.from('screenshots').getPublicUrl(path);

    const notes = document.getElementById('clue-notes').value.trim() || null;
    const { error: insertError } = await db.from('clues').insert({
      screenshot_url: publicUrl,
      uploaded_by: currentUser.id,
      notes,
    });
    if (insertError) throw insertError;

    toggleUploadForm();
    await loadClues();
  } catch (err) {
    errorEl.textContent = 'Upload failed: ' + err.message;
    errorEl.style.display = 'block';
    btn.disabled = false;
    btn.textContent = 'Upload';
  }
}

async function startEditNote(triggerEl, clueId) {
  const card = triggerEl.closest('.clue-card');
  const notesWrap = card.querySelector('.clue-card-notes-wrap');
  const currentText = card.querySelector('.clue-card-notes')?.textContent ?? '';

  const editWrap = document.createElement('div');
  editWrap.className = 'clue-note-edit-wrap';
  editWrap.innerHTML = `
    <textarea class="clue-note-textarea" rows="2">${escapeHtml(currentText)}</textarea>
    <div class="clue-note-actions">
      <button class="btn btn-primary btn-sm" style="font-size:0.78rem;padding:5px 12px">Save</button>
      <button class="btn btn-ghost btn-sm" style="font-size:0.78rem;padding:5px 10px">Cancel</button>
    </div>`;

  const footer = card.querySelector('.clue-card-footer');
  if (notesWrap) notesWrap.replaceWith(editWrap);
  else card.insertBefore(editWrap, footer);

  const textarea = editWrap.querySelector('textarea');
  const [saveBtn, cancelBtn] = editWrap.querySelectorAll('button');
  textarea.focus();
  textarea.setSelectionRange(textarea.value.length, textarea.value.length);

  cancelBtn.addEventListener('click', () => loadClues());

  saveBtn.addEventListener('click', async () => {
    const notes = textarea.value.trim() || null;
    saveBtn.disabled = true;
    saveBtn.textContent = 'Saving...';
    const { error } = await db.from('clues').update({ notes }).eq('id', clueId);
    if (error) {
      alert('Failed to save note: ' + error.message);
      saveBtn.disabled = false;
      saveBtn.textContent = 'Save';
      return;
    }
    await loadClues();
  });
}

async function init() {
  await initAuth();

  if (currentUser) {
    const uploadBtn = document.getElementById('upload-btn');
    uploadBtn.style.display = 'inline-block';
    uploadBtn.addEventListener('click', toggleUploadForm);
  }

  document.getElementById('cancel-upload-btn').addEventListener('click', toggleUploadForm);
  document.getElementById('submit-clue-btn').addEventListener('click', handleUpload);

  document.getElementById('clue-file').addEventListener('change', e => {
    const file = e.target.files[0];
    if (!file) return;
    selectedFile = file;
    document.getElementById('upload-label-text').textContent = file.name;
    const preview = document.getElementById('clue-file-preview');
    preview.src = URL.createObjectURL(file);
    document.getElementById('clue-preview-wrap').style.display = 'block';
  });

  await loadClues();
}

init();
