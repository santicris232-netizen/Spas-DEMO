// ===== USUARIOS =====
const USERS = [
  { username: 'admin',   password: 'admin123', role: 'admin' },
  { username: 'usuario', password: 'user123',  role: 'user'  },
];

// ===== PRODUCTOS POR DEFECTO =====
const DEFAULT_PRODUCTS = [
  { id: 1,  name: 'Lifting de Pestanas',      description: 'Tratamiento que curva y levanta tus pestanas naturales desde la raiz, otorgando una mirada profunda y seductora con efecto duradero de 6 a 8 semanas.',              price: '$80.000',  category: 'pestanas', image: '' },
  { id: 2,  name: 'Extensiones Clasicas',      description: 'Aplicacion de una extension por pestana natural. Resultado elegante y natural para quienes buscan realzar su mirada sutilmente.',                                    price: '$120.000', category: 'pestanas', image: '' },
  { id: 3,  name: 'Extensiones Volumen',       description: 'Tecnica rusa de abanico que crea un efecto lleno y dramatico. Ideal para un look de impacto con total comodidad.',                                                   price: '$160.000', category: 'pestanas', image: '' },
  { id: 4,  name: 'Tinte de Pestanas',         description: 'Coloracion profesional que intensifica el tono natural de tus pestanas, perfecta para lucir sin mascara con una mirada definida.',                                   price: '$45.000',  category: 'pestanas', image: '' },
  { id: 5,  name: 'Mantenimiento Express',     description: 'Relleno y ajuste de extensiones existentes para mantener tu mirada perfecta. Recomendado cada 2 a 3 semanas.',                                                       price: '$70.000',  category: 'pestanas', image: '' },
  { id: 6,  name: 'Diseno de Cejas',           description: 'Diseno personalizado segun la morfologia de tu rostro. Perfilado, depilacion y definicion para unas cejas perfectas y equilibradas.',                               price: '$35.000',  category: 'cejas',    image: '' },
  { id: 7,  name: 'Laminado de Cejas',         description: 'Tratamiento de reestructuracion que alisa y fija los vellos de las cejas, dando un aspecto grueso y esponjoso por hasta 6 semanas.',                                price: '$90.000',  category: 'cejas',    image: '' },
  { id: 8,  name: 'Henna de Cejas',            description: 'Coloracion natural con henna vegetal que tinta el vello y la piel, otorgando profundidad y definicion duradera a tus cejas.',                                       price: '$55.000',  category: 'cejas',    image: '' },
  { id: 9,  name: 'Hidratacion de Labios',     description: 'Tratamiento nutritivo e hidratante que devuelve suavidad y volumen a tus labios. Incluye exfoliacion y mascarilla hidratante profesional.',                         price: '$40.000',  category: 'labios',   image: '' },
  { id: 10, name: 'Blushed Lips',              description: 'Tecnica de maquillaje semipermanente que aporta un color natural y difuminado a los labios, logrando un efecto rubor muy natural y duradero.',                      price: '$180.000', category: 'labios',   image: '' },
];

// ===== ESTADO =====
let currentUser      = null;
let products         = [];
let currentCategory  = 'pestanas';
let bookIndex        = { pestanas: 0, cejas: 0, labios: 0 };
let isAnimating      = false;
let editingProductId = null;
let addImageBase64   = '';
let editImageBase64  = '';
let touchStartX      = 0;
let touchStartY      = 0;
let touchIsSwiping   = false;

// ===== INIT =====
document.addEventListener('DOMContentLoaded', () => {
  loadProducts();
  setupLoginForm();
  setupCategoryTabs();
  setupAdminTabs();
  setupAddProductForm();
  setupEditModal();
  setupImageUploads();
  showScreen('login-screen');
});

// ===== ALMACENAMIENTO =====
function loadProducts() {
  const stored = localStorage.getItem('maisonlash_v3');
  products = stored ? JSON.parse(stored) : JSON.parse(JSON.stringify(DEFAULT_PRODUCTS));
  saveProducts();
}
function saveProducts() {
  localStorage.setItem('maisonlash_v3', JSON.stringify(products));
}

// ===== PANTALLAS =====
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}

// ===== LOGIN =====
function setupLoginForm() {
  document.getElementById('login-form').addEventListener('submit', e => {
    e.preventDefault();
    const username = document.getElementById('login-username').value.trim();
    const password = document.getElementById('login-password').value;
    const user     = USERS.find(u => u.username === username && u.password === password);
    const err      = document.getElementById('login-error');
    if (user) {
      err.style.display = 'none';
      currentUser = user;
      if (user.role === 'admin') { loadAdminScreen(); showScreen('admin-screen'); }
      else                       { loadUserScreen();  showScreen('user-screen');  }
    } else {
      err.style.display = 'block';
      err.textContent = 'Usuario o contrasena incorrectos.';
      document.getElementById('login-password').value = '';
    }
  });
}

function logout() {
  currentUser = null;
  document.getElementById('login-username').value = '';
  document.getElementById('login-password').value = '';
  document.getElementById('login-error').style.display = 'none';
  showScreen('login-screen');
}

// ===== PANTALLA USUARIO =====
function loadUserScreen() {
  currentCategory = 'pestanas';
  bookIndex = { pestanas: 0, cejas: 0, labios: 0 };
  document.querySelectorAll('.cat-tab').forEach(t => t.classList.remove('active'));
  document.querySelector('.cat-tab[data-cat="pestanas"]').classList.add('active');
  renderBookCard();
  setupSwipe();
}

// ===== PESTANAS DE CATEGORIA =====
function setupCategoryTabs() {
  document.querySelectorAll('.cat-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      if (isAnimating) return;
      document.querySelectorAll('.cat-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      currentCategory = tab.dataset.cat;
      renderBookCard();
    });
  });
}

// ===== RENDER TARJETA LIBRO =====
function getCategoryProducts() {
  return products.filter(p => p.category === currentCategory);
}

function renderBookCard() {
  const card        = document.getElementById('book-card');
  const catProducts = getCategoryProducts();
  const idx         = bookIndex[currentCategory];

  updatePageDots(catProducts.length, idx);
  updateNavButtons(catProducts.length, idx);

  if (catProducts.length === 0) {
    card.innerHTML = `
      <div class="book-empty">
        <div class="empty-icon">${getCategoryIcon(currentCategory)}</div>
        <h3>Sin servicios aun</h3>
        <p>El administrador aun no ha<br>agregado servicios en esta categoria.</p>
      </div>`;
    return;
  }

  const product   = catProducts[idx];
  const imageHTML = product.image
    ? `<img class="card-image" src="${escapeAttr(product.image)}" alt="${escapeAttr(product.name)}">`
    : `<div class="card-image-placeholder">${getCategoryIcon(currentCategory)}</div>`;

  card.innerHTML = `
    ${imageHTML}
    <div class="card-separator"></div>
    <div class="card-body">
      <div class="card-category-tag">${escapeHTML(currentCategory)}</div>
      <h2 class="card-name">${escapeHTML(product.name)}</h2>
      <p class="card-desc">${escapeHTML(product.description)}</p>
      <div class="card-footer">
        <span class="card-price">${escapeHTML(product.price)}</span>
        <span class="card-badge">Servicio</span>
      </div>
    </div>
    <span class="card-page-num">${String(idx + 1).padStart(2,'0')} / ${String(catProducts.length).padStart(2,'0')}</span>`;
}

function getCategoryIcon(cat) {
  const icons = { pestanas: '✨', cejas: '🌿', labios: '💋' };
  return icons[cat] || '🌸';
}

function updatePageDots(total, current) {
  const container = document.getElementById('page-dots');
  container.innerHTML = '';
  const count = Math.min(total, 8);
  for (let i = 0; i < count; i++) {
    const dot = document.createElement('div');
    dot.className = 'page-dot' + (i === current ? ' active' : '');
    dot.addEventListener('click', () => navigateToIndex(i));
    container.appendChild(dot);
  }
}

function updateNavButtons(total, current) {
  const btnPrev = document.getElementById('btn-prev');
  const btnNext = document.getElementById('btn-next');
  if (btnPrev) btnPrev.disabled = (current === 0 || total === 0);
  if (btnNext) btnNext.disabled = (current >= total - 1 || total === 0);
}

// ===== NAVEGACION LIBRO =====
function navigateToIndex(newIdx) {
  if (isAnimating) return;
  const catProducts = getCategoryProducts();
  if (newIdx < 0 || newIdx >= catProducts.length) return;
  const dir = newIdx > bookIndex[currentCategory] ? 'next' : 'prev';
  bookIndex[currentCategory] = newIdx;
  flipToPage(dir);
}

function navigateBook(direction) {
  if (isAnimating) return;
  const catProducts = getCategoryProducts();
  const idx         = bookIndex[currentCategory];
  if (direction === 'next' && idx < catProducts.length - 1) {
    bookIndex[currentCategory]++;
    flipToPage('next');
  } else if (direction === 'prev' && idx > 0) {
    bookIndex[currentCategory]--;
    flipToPage('prev');
  }
}

function flipToPage(direction) {
  if (isAnimating) return;
  isAnimating = true;
  const card     = document.getElementById('book-card');
  const outClass = direction === 'next' ? 'flip-out-next' : 'flip-out-prev';
  const inClass  = direction === 'next' ? 'flip-in-next'  : 'flip-in-prev';

  card.classList.add(outClass);
  card.addEventListener('animationend', () => {
    card.classList.remove(outClass);
    renderBookCard();
    card.classList.add(inClass);
    card.addEventListener('animationend', () => {
      card.classList.remove(inClass);
      isAnimating = false;
    }, { once: true });
  }, { once: true });
}

// ===== DETECCION SWIPE =====
function setupSwipe() {
  const wrapper = document.getElementById('book-wrapper');
  if (!wrapper) return;

  wrapper.addEventListener('touchstart', e => {
    touchStartX     = e.changedTouches[0].clientX;
    touchStartY     = e.changedTouches[0].clientY;
    touchIsSwiping  = false;
  }, { passive: true });

  wrapper.addEventListener('touchmove', e => {
    const dx = Math.abs(e.changedTouches[0].clientX - touchStartX);
    const dy = Math.abs(e.changedTouches[0].clientY - touchStartY);
    if (dx > dy && dx > 10) { touchIsSwiping = true; e.preventDefault(); }
  }, { passive: false });

  wrapper.addEventListener('touchend', e => {
    if (!touchIsSwiping) return;
    const dx = e.changedTouches[0].clientX - touchStartX;
    if (Math.abs(dx) < 50) return;
    navigateBook(dx < 0 ? 'next' : 'prev');
  });
}

// ===== PANTALLA ADMIN =====
function loadAdminScreen() {
  switchAdminTab('add');
  renderAdminList();
}
function setupAdminTabs() {
  document.querySelectorAll('.admin-tab').forEach(tab => {
    tab.addEventListener('click', () => switchAdminTab(tab.dataset.tab));
  });
}
function switchAdminTab(tab) {
  document.querySelectorAll('.admin-tab').forEach(t  => t.classList.remove('active'));
  document.querySelectorAll('.admin-panel').forEach(p => p.classList.remove('active'));
  document.querySelector(`.admin-tab[data-tab="${tab}"]`).classList.add('active');
  document.getElementById(`panel-${tab}`).classList.add('active');
  if (tab === 'list') renderAdminList();
}

// ===== AGREGAR PRODUCTO =====
function setupAddProductForm() {
  document.getElementById('add-product-form').addEventListener('submit', e => {
    e.preventDefault();
    const name        = document.getElementById('add-name').value.trim();
    const description = document.getElementById('add-desc').value.trim();
    const price       = document.getElementById('add-price').value.trim();
    const category    = document.getElementById('add-category').value;
    if (!name || !description || !price) return;
    products.push({ id: Date.now(), name, description, price, category, image: addImageBase64 });
    saveProducts();
    document.getElementById('add-product-form').reset();
    addImageBase64 = '';
    document.getElementById('add-image-preview').style.display = 'none';
    showToast('Servicio agregado correctamente');
    renderAdminList();
  });
}

// ===== IMAGENES =====
function setupImageUploads() {
  setupImgInput('add-image-input',  'add-image-preview',  b64 => { addImageBase64  = b64; });
  setupImgInput('edit-image-input', 'edit-image-preview', b64 => { editImageBase64 = b64; });
}
function setupImgInput(inputId, previewId, onLoad) {
  document.getElementById(inputId).addEventListener('change', e => {
    const file = e.target.files[0];
    if (!file) return;
    if (!file.type.startsWith('image/'))   { showToast('Selecciona una imagen valida'); return; }
    if (file.size > 5 * 1024 * 1024)       { showToast('Imagen demasiado grande (max 5MB)'); return; }
    const reader = new FileReader();
    reader.onload = ev => {
      onLoad(ev.target.result);
      const preview = document.getElementById(previewId);
      preview.src   = ev.target.result;
      preview.style.display = 'block';
    };
    reader.readAsDataURL(file);
  });
}

// ===== LISTA ADMIN =====
function renderAdminList() {
  const container = document.getElementById('admin-product-list');
  container.innerHTML = '';
  if (products.length === 0) {
    container.innerHTML = `<div class="catalog-empty"><div class="empty-icon">📋</div><p>No hay servicios aun.<br>Agrega el primero desde "Agregar".</p></div>`;
    return;
  }
  ['pestanas', 'cejas', 'labios'].forEach(cat => {
    const catProducts = products.filter(p => p.category === cat);
    if (catProducts.length === 0) return;
    const header = document.createElement('div');
    header.className = 'cat-section-header';
    header.textContent = getCategoryIcon(cat) + ' ' + cat.toUpperCase();
    container.appendChild(header);
    catProducts.forEach(product => {
      const item       = document.createElement('div');
      item.className   = 'admin-product-item';
      const thumbHTML  = product.image
        ? `<div class="admin-product-thumb"><img src="${escapeAttr(product.image)}" alt="${escapeAttr(product.name)}"></div>`
        : `<div class="admin-product-thumb">${getCategoryIcon(cat)}</div>`;
      item.innerHTML = `
        ${thumbHTML}
        <div class="admin-product-info">
          <div class="prod-cat">${escapeHTML(cat)}</div>
          <h4>${escapeHTML(product.name)}</h4>
          <p class="prod-desc">${escapeHTML(product.description)}</p>
          <p class="prod-price">${escapeHTML(product.price)}</p>
        </div>
        <div class="admin-product-actions">
          <button class="btn-edit"   title="Editar"   onclick="openEditModal(${product.id})">✏️</button>
          <button class="btn-delete" title="Eliminar" onclick="deleteProduct(${product.id})">🗑️</button>
        </div>`;
      container.appendChild(item);
    });
  });
}

// ===== ELIMINAR =====
function deleteProduct(id) {
  if (!confirm('Eliminar este servicio?')) return;
  products = products.filter(p => p.id !== id);
  saveProducts();
  renderAdminList();
  showToast('Servicio eliminado');
}

// ===== MODAL EDICION =====
function setupEditModal() {
  document.getElementById('edit-modal').addEventListener('click', e => {
    if (e.target === document.getElementById('edit-modal')) closeEditModal();
  });
  document.getElementById('edit-product-form').addEventListener('submit', e => {
    e.preventDefault();
    const idx = products.findIndex(p => p.id === editingProductId);
    if (idx === -1) return;
    products[idx].name        = document.getElementById('edit-name').value.trim();
    products[idx].description = document.getElementById('edit-desc').value.trim();
    products[idx].price       = document.getElementById('edit-price').value.trim();
    products[idx].category    = document.getElementById('edit-category').value;
    if (editImageBase64) products[idx].image = editImageBase64;
    saveProducts();
    closeEditModal();
    renderAdminList();
    showToast('Servicio actualizado');
  });
}

function openEditModal(id) {
  const product = products.find(p => p.id === id);
  if (!product) return;
  editingProductId = id;
  editImageBase64  = '';
  document.getElementById('edit-name').value     = product.name;
  document.getElementById('edit-desc').value     = product.description;
  document.getElementById('edit-price').value    = product.price;
  document.getElementById('edit-category').value = product.category || 'pestanas';
  const preview = document.getElementById('edit-image-preview');
  preview.style.display = product.image ? 'block' : 'none';
  if (product.image) preview.src = product.image;
  document.getElementById('edit-modal').classList.add('active');
}

function closeEditModal() {
  document.getElementById('edit-modal').classList.remove('active');
  editingProductId = null;
  editImageBase64  = '';
}

// ===== TOAST =====
function showToast(msg) {
  const toast = document.getElementById('toast');
  toast.textContent = msg;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 2800);
}

// ===== SEGURIDAD: escape de HTML =====
function escapeHTML(str) {
  return String(str)
    .replace(/&/g,  '&amp;')
    .replace(/</g,  '&lt;')
    .replace(/>/g,  '&gt;')
    .replace(/"/g,  '&quot;')
    .replace(/'/g,  '&#39;');
}
function escapeAttr(str) {
  return String(str).replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
