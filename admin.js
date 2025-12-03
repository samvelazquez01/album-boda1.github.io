// admin.js COMPLETO con mejoras Bytescale + limpieza de portadas antiguas + cache busting

const BYTESCALE_API_KEY = 'public_W23MTTM2dP5F5CY6XxYF4PbqaZDg';
const BYTESCALE_WIDGET_SRC = 'https://js.bytescale.com/upload-widget/v4';

import {
  collection,
  addDoc,
  onSnapshot,
  query,
  orderBy,
  getDocs,
  doc,
  deleteDoc,
  setDoc,
  updateDoc,
  serverTimestamp,
  getDoc
} from 'https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js';

// ELEMENTOS UI
const albumNameInput = document.getElementById('album-name-input');
const createAlbumBtn = document.getElementById('create-album-btn');
const albumsList = document.getElementById('albums-list');
const albumSelect = document.getElementById('album-select');
const filterAlbumSelect = document.getElementById('filter-album-select');
const photosList = document.getElementById('photos-list');
const uploadArea = document.getElementById('upload-area');
const coverPreview = document.getElementById('cover-preview');
const deleteCoverBtn = document.getElementById('delete-cover-btn');
const uploadProgress = document.getElementById('upload-progress');
const progressFill = document.querySelector('.progress-fill');
const progressText = document.querySelector('.progress-text');

// FIRESTORE referencias
const albumsCol = () => collection(window.db, 'albums');
const photosCol = () => collection(window.db, 'photos');
const settingsDocRef = () => doc(window.db, 'meta', 'settings');

function loadBytescaleWidget() {
  return new Promise((resolve) => {
    if (window.Bytescale?.UploadWidget) return resolve();
    const s = document.createElement('script');
    s.src = BYTESCALE_WIDGET_SRC;
    s.onload = resolve;
    document.head.appendChild(s);
  });
}

function showProgress(percent, text) {
  uploadProgress.classList.remove('hidden');
  progressFill.style.width = percent + '%';
  progressText.textContent = text;
  if (percent >= 100) setTimeout(() => uploadProgress.classList.add('hidden'), 800);
}

function clearChildren(el) { while (el.firstChild) el.removeChild(el.firstChild); }

function renderAlbums(albums) {
  clearChildren(albumsList);
  clearChildren(albumSelect);
  clearChildren(filterAlbumSelect);

  const def = document.createElement('option');
  def.value = '';
  def.textContent = 'Selecciona un momento';
  albumSelect.appendChild(def);

  const def2 = document.createElement('option');
  def2.value = '';
  def2.textContent = 'Todos';
  filterAlbumSelect.appendChild(def2);

  albums.forEach(a => {
    const d = document.createElement('div');
    d.className = 'album-item';
    d.innerHTML = `<div class="album-item-name">${a.name}</div><div><span class="album-item-count">${a.count || 0} fotos</span><button class="create-btn">Abrir</button></div>`;
    d.querySelector('button').onclick = () => {
      filterAlbumSelect.value = a.id;
      window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
    };
    albumsList.appendChild(d);

    const o = document.createElement('option'); o.value = a.id; o.textContent = a.name; albumSelect.appendChild(o);
    const o2 = document.createElement('option'); o2.value = a.id; o2.textContent = a.name; filterAlbumSelect.appendChild(o2);
  });
}

function renderPhotos(photos) {
  clearChildren(photosList);
  photos.forEach(p => {
    const wrap = document.createElement('div'); wrap.className = 'photo-item';
    const img = document.createElement('img'); img.src = p.url + '?v=' + Date.now(); img.className = 'gallery-item-img';
    const ov = document.createElement('div'); ov.className = 'photo-item-overlay';
    const del = document.createElement('button'); del.className = 'photo-delete-btn'; del.textContent = 'Eliminar';
    del.onclick = () => confirmDeletePhoto(p.id);
    ov.appendChild(del);
    wrap.appendChild(img); wrap.appendChild(ov);
    photosList.appendChild(wrap);
  });
}

async function updateAlbumCounts(allPhotos) {
  const counts = {};
  allPhotos.forEach(p => counts[p.albumId] = (counts[p.albumId] || 0) + 1);
  const snaps = await getDocs(albumsCol());
  snaps.forEach(a => {
    const n = counts[a.id] || 0;
    if (a.data().count !== n)
      updateDoc(doc(window.db, 'albums', a.id), { count: n });
  });
}

createAlbumBtn.onclick = async () => {
  const name = albumNameInput.value.trim();
  if (!name) return alert('Escribe un nombre');
  await addDoc(albumsCol(), { name, createdAt: serverTimestamp(), count: 0 });
  albumNameInput.value = '';
};

async function openBytescaleUpload({ multi=false }={}) {
  await loadBytescaleWidget();
  return window.Bytescale.UploadWidget.open({
    apiKey: BYTESCALE_API_KEY,
    multi,
    maxFileSizeBytes: 500*1024*1024,
    mimeTypes: ['image/jpeg','image/png','image/webp']
  });
}

// ---- PORTADA ----

document.querySelector("label[for='cover-input']").addEventListener('click', async (e) => {
  e.preventDefault();
  const files = await openBytescaleUpload({ multi:false });
  if (!files.length) return;
  const url = files[0].fileUrl;

  await setDoc(settingsDocRef(), { coverUrl: url }, { merge: true });
  renderCover(url);
  alert('Portada actualizada');
});

deleteCoverBtn.onclick = async () => {
  if (!confirm('Eliminar portada?')) return;
  await updateDoc(settingsDocRef(), { coverUrl: '' });
  renderCover('');
};

async function loadCover() {
  const snap = await getDoc(settingsDocRef());
  const d = snap.exists() ? snap.data() : {};

  if (d.coverUrl && d.coverUrl.includes('google')) {
    await setDoc(settingsDocRef(), { coverUrl: '' }, { merge:true });
    return renderCover('');
  }

  renderCover(d.coverUrl || '');
}

function renderCover(url) {
  clearChildren(coverPreview);
  if (!url) {
    const t=document.createElement('span'); t.textContent='Sin portada'; coverPreview.appendChild(t);
    deleteCoverBtn.classList.add('hidden');
    return;
  }
  const img=document.createElement('img'); img.src=url+'?v='+Date.now(); coverPreview.appendChild(img);
  deleteCoverBtn.classList.remove('hidden');
}

// ---- FOTOS ----

uploadArea.onclick = async () => {
  const albumId = albumSelect.value;
  if (!albumId) return alert('Selecciona un momento');
  const files = await openBytescaleUpload({ multi:true });
  if (!files.length) return;
  let i=0;
  for (const f of files) {
    i++;
    await addDoc(photosCol(), {
      albumId,
      url: f.fileUrl,
      filename: f.filename,
      createdAt: serverTimestamp()
    });
    showProgress((i/files.length)*100, `Subiendo ${i}/${files.length}`);
  }
  alert('Fotos subidas');
};

async function confirmDeletePhoto(id) {
  if (!confirm('Eliminar foto?')) return;
  await deleteDoc(doc(window.db, 'photos', id));
  alert('Foto eliminada (el archivo sigue en Bytescale)');
}

// ---- LISTENERS ----

function startRealtime() {
  onSnapshot(query(albumsCol(), orderBy('createdAt','desc')), snap => {
    const albums = snap.docs.map(d => ({id:d.id,...d.data()})); renderAlbums(albums);
  });

  onSnapshot(query(photosCol(), orderBy('createdAt','desc')), snap => {
    const photos = snap.docs.map(d => ({id:d.id,...d.data()}));
    const f = filterAlbumSelect.value;
    const filtered = f ? photos.filter(p=>p.albumId===f) : photos;
    renderPhotos(filtered);
    updateAlbumCounts(photos);
  });
}

// ---- INIT ----
(async function(){
  await loadCover();
  startRealtime();
})();
