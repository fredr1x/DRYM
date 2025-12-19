const API_PRODUCTS_BASE = 'http://localhost:8080/api/v1/products';
const LS_ACCESS_TOKEN_KEY = 'oss_jwt_access';
const LS_PROFILE_KEY = 'oss_profile_user';

const CATEGORY_LABELS = {
    ELECTRONICS: 'Электроника',
    CLOTHING: 'Одежда',
    FOOD: 'Еда',
    BOOKS: 'Книги',
    HOME: 'Дом',
    HEALTH: 'Здоровье',
    SPORT: 'Спорт',
    OFFICE: 'Офис',
    OTHER: 'Другое',
};

let currentCategory = 'ELECTRONICS';
let products = [];
let modalMode = 'create'; // 'create' | 'edit'

// Helpers
function getAccessToken() {
    try {
        return localStorage.getItem(LS_ACCESS_TOKEN_KEY);
    } catch {
        return null;
    }
}

function ensureAuthOrRedirect() {
    const token = getAccessToken();
    if (!token) {
        window.location.href = '../login.html';
    }
}

function getAuthHeaders(extra = {}) {
    const token = getAccessToken();
    const headers = { ...extra };
    if (token) {
        headers.Authorization = `Bearer ${token}`;
    }
    return headers;
}

async function authorizedFetch(url, options = {}) {
    const opts = {
        ...options,
        headers: getAuthHeaders(options.headers || {}),
    };
    const res = await fetch(url, opts);
    if (res.status === 401 || res.status === 403) {
        window.location.href = '../login.html';
        throw new Error('Не авторизован');
    }
    return res;
}

let toastTimeout;
function showToast(message, type = 'success') {
    const toast = document.getElementById('toast');
    if (!toast) return;
    toast.textContent = message;
    toast.className = 'toast';
    if (type === 'error') {
        toast.classList.add('error');
    }
    toast.classList.add('visible');
    clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => {
        toast.classList.remove('visible');
    }, 2500);
}

// API
async function fetchProductsByCategory(category) {
    const res = await authorizedFetch(
        `${API_PRODUCTS_BASE}/category?category=${encodeURIComponent(category)}`
    );
    if (!res.ok) {
        throw new Error('Не удалось загрузить товары');
    }
    return res.json();
}

async function apiAddProduct({ product, imageFile }) {
    const formData = new FormData();
    formData.append('product', new Blob([JSON.stringify(product)], { type: 'application/json' }));
    if (imageFile) {
        formData.append('image', imageFile);
    }

    const res = await authorizedFetch(`${API_PRODUCTS_BASE}/add`, {
        method: 'POST',
        body: formData,
    });
    if (!res.ok) {
        throw new Error('Не удалось добавить товар');
    }
    return res.json();
}

async function apiUpdateProduct(product) {
    const res = await authorizedFetch(`${API_PRODUCTS_BASE}/update_product`, {
        method: 'PUT',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(product),
    });
    if (!res.ok) {
        throw new Error('Не удалось обновить товар');
    }
    return res.json();
}

async function apiChangeStock(id, stock) {
    const res = await authorizedFetch(`${API_PRODUCTS_BASE}/change_stock`, {
        method: 'PATCH',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ id, stock }),
    });
    if (!res.ok) {
        throw new Error('Не удалось обновить количество');
    }
    return res.json();
}

async function apiChangePrice(id, price) {
    const res = await authorizedFetch(`${API_PRODUCTS_BASE}/change_price`, {
        method: 'PATCH',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ id, price }),
    });
    if (!res.ok) {
        throw new Error('Не удалось обновить цену');
    }
    return res.json();
}

async function apiDeleteProduct(id) {
    const res = await authorizedFetch(
        `${API_PRODUCTS_BASE}/delete/${encodeURIComponent(id)}`,
        {
            method: 'DELETE',
        }
    );
    if (!res.ok) {
        throw new Error('Не удалось удалить товар');
    }
}

async function loadProductImageToElement(productId, imgElement) {
    if (!imgElement) return;
    try {
        const res = await authorizedFetch(
            `${API_PRODUCTS_BASE}/${encodeURIComponent(productId)}/image`
        );
        if (!res.ok) {
            return false;
        }
        const blob = await res.blob();
        const objectUrl = URL.createObjectURL(blob);
        imgElement.src = objectUrl;
        return true;
    } catch (e) {
        console.error('Ошибка загрузки изображения товара', e);
        return false;
    }
}

// UI
function setCurrentCategory(category) {
    currentCategory = category;
    const title = document.getElementById('currentCategoryTitle');
    if (title) {
        title.textContent = CATEGORY_LABELS[category] || category;
    }
    document
        .querySelectorAll('.category-btn')
        .forEach((btn) =>
            btn.classList.toggle('active', btn.dataset.category === category)
        );
}

function renderProducts(list) {
    products = list || [];
    const container = document.getElementById('productsContainer');
    const emptyState = document.getElementById('emptyState');
    if (!container || !emptyState) return;

    container.innerHTML = '';

    if (!products.length) {
        emptyState.hidden = false;
        return;
    }

    emptyState.hidden = true;

    products.forEach((p) => {
        const card = document.createElement('article');
        card.className = 'product-card';

        const imageWrapper = document.createElement('div');
        imageWrapper.className = 'product-image-wrapper';
        const img = document.createElement('img');
        img.className = 'product-image';
        img.alt = p.name || 'product image';
        imageWrapper.appendChild(img);
        loadProductImageToElement(p.id, img);

        const body = document.createElement('div');
        body.className = 'product-body';

        const title = document.createElement('h3');
        title.className = 'product-title';
        title.textContent = p.name;

        const cat = document.createElement('div');
        cat.className = 'product-category';
        cat.textContent = CATEGORY_LABELS[p.category] || p.category;

        const meta = document.createElement('div');
        meta.className = 'product-meta';
        const price = document.createElement('span');
        price.className = 'product-price';
        price.textContent = `${Number(p.price).toFixed(2)} ₸`;
        const stock = document.createElement('span');
        stock.className = 'product-stock';
        stock.textContent = `На складе: ${p.stock}`;
        meta.append(price, stock);

        body.append(title, cat, meta);

        const actions = document.createElement('div');
        actions.className = 'product-actions';

        const inlineGroup = document.createElement('div');
        inlineGroup.className = 'inline-edit';

        const priceWrap = document.createElement('div');
        const priceLabel = document.createElement('div');
        priceLabel.className = 'small-label';
        priceLabel.textContent = 'Цена';
        const priceInput = document.createElement('input');
        priceInput.type = 'number';
        priceInput.min = '0';
        priceInput.step = '0.01';
        priceInput.value = p.price;
        priceInput.addEventListener('change', () =>
            handleChangePrice(p.id, priceInput.value)
        );
        priceWrap.append(priceLabel, priceInput);

        const stockWrap = document.createElement('div');
        const stockLabel = document.createElement('div');
        stockLabel.className = 'small-label';
        stockLabel.textContent = 'Кол-во';
        const stockInput = document.createElement('input');
        stockInput.type = 'number';
        stockInput.min = '0';
        stockInput.step = '1';
        stockInput.value = p.stock;
        stockInput.addEventListener('change', () =>
            handleChangeStock(p.id, stockInput.value)
        );
        stockWrap.append(stockLabel, stockInput);

        inlineGroup.append(priceWrap, stockWrap);

        const rightGroup = document.createElement('div');
        rightGroup.style.display = 'flex';
        rightGroup.style.gap = '4px';
        rightGroup.style.alignItems = 'center';

        const editBtn = document.createElement('button');
        editBtn.className = 'btn small ghost';
        editBtn.textContent = 'Редакт.';
        editBtn.addEventListener('click', () => openEditModal(p));

        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'icon-btn';
        deleteBtn.innerHTML =
            '<svg class="icon-trash" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 3a1 1 0 0 0-.894.553L7.382 5H4a1 1 0 1 0 0 2h.278l.84 11.207A3 3 0 0 0 8.11 21h7.78a3 3 0 0 0 2.992-2.793L19.722 7H20a1 1 0 1 0 0-2h-3.382l-.724-1.447A1 1 0 0 0 15 3H9zm2.618 4a1 1 0 0 0-.996.92L10 8v8a1 1 0 0 0 1.993.117L12 16V8a1 1 0 0 0-1-1h-.382zm3.764 0a1 1 0 0 0-.996.92L14 8v8a1 1 0 0 0 1.993.117L16 16V8a1 1 0 0 0-1-1h-.618zM9 5h6l.333.667H8.667L9 5z"/></svg>';
        deleteBtn.addEventListener('click', () => handleDeleteProduct(p.id));

        rightGroup.append(editBtn, deleteBtn);
        actions.append(inlineGroup, rightGroup);

        card.append(imageWrapper, body, actions);
        container.appendChild(card);
    });
}

// Modal
function openModal() {
    const modal = document.getElementById('productModal');
    const backdrop = document.getElementById('modalBackdrop');
    if (!modal || !backdrop) return;
    modal.hidden = false;
    backdrop.hidden = false;
    requestAnimationFrame(() => {
        modal.classList.add('open');
        backdrop.classList.add('open');
    });
}

function closeModal() {
    const modal = document.getElementById('productModal');
    const backdrop = document.getElementById('modalBackdrop');
    const errorEl = document.getElementById('modalError');
    if (errorEl) errorEl.textContent = '';
    if (!modal || !backdrop) return;
    modal.classList.remove('open');
    backdrop.classList.remove('open');
    setTimeout(() => {
        modal.hidden = true;
        backdrop.hidden = true;
    }, 200);
}

function resetModalForm() {
    const form = document.getElementById('productForm');
    const idInput = document.getElementById('productId');
    const nameInput = document.getElementById('productName');
    const descInput = document.getElementById('productDescription');
    const priceInput = document.getElementById('productPrice');
    const stockInput = document.getElementById('productStock');
    const categorySelect = document.getElementById('productCategory');
    const imageInput = document.getElementById('productImage');
    const imageName = document.getElementById('productImageName');
    const previewField = document.getElementById('imagePreviewField');
    const previewImg = document.getElementById('productImagePreview');
    const previewMsg = document.getElementById('productImagePreviewMessage');
    const errorEl = document.getElementById('modalError');

    if (form) form.reset();
    if (idInput) idInput.value = '';
    if (nameInput) nameInput.value = '';
    if (descInput) descInput.value = '';
    if (priceInput) priceInput.value = '';
    if (stockInput) stockInput.value = '';
    if (categorySelect) {
        categorySelect.value = currentCategory;
        categorySelect.disabled = false;
    }
    if (imageInput) {
        imageInput.value = '';
        imageInput.disabled = false;
    }
    if (imageName) {
        imageName.textContent = 'Файл не выбран';
    }
    if (previewField) previewField.hidden = true;
    if (previewImg) {
        previewImg.src = '';
        previewImg.hidden = true;
    }
    if (previewMsg) {
        previewMsg.hidden = false;
    }
    if (errorEl) errorEl.textContent = '';
}

function openCreateModal() {
    modalMode = 'create';
    resetModalForm();
    const title = document.getElementById('modalTitle');
    const imageWrapper = document.getElementById('imageFieldWrapper');
    if (title) title.textContent = 'Добавить товар';
    if (imageWrapper) imageWrapper.style.display = '';
    openModal();
}

function openEditModal(product) {
    modalMode = 'edit';
    resetModalForm();
    const title = document.getElementById('modalTitle');
    const idInput = document.getElementById('productId');
    const nameInput = document.getElementById('productName');
    const descInput = document.getElementById('productDescription');
    const priceInput = document.getElementById('productPrice');
    const stockInput = document.getElementById('productStock');
    const categorySelect = document.getElementById('productCategory');
    const imageWrapper = document.getElementById('imageFieldWrapper');
    const imageInput = document.getElementById('productImage');
    const imageName = document.getElementById('productImageName');
    const previewField = document.getElementById('imagePreviewField');
    const previewImg = document.getElementById('productImagePreview');

    if (title) title.textContent = 'Редактировать товар';
    if (idInput) idInput.value = product.id;
    if (nameInput) nameInput.value = product.name || '';
    if (descInput) descInput.value = product.description || '';
    if (priceInput) priceInput.value = product.price;
    if (stockInput) stockInput.value = product.stock;
    if (categorySelect) {
        categorySelect.value = product.category;
        categorySelect.disabled = true;
    }
    if (imageWrapper) imageWrapper.style.display = 'none';
    if (imageInput) {
        imageInput.value = '';
        imageInput.disabled = true;
    }
    if (imageName) {
        imageName.textContent = 'Изображение не изменяется';
    }
    if (previewField && previewImg) {
        const msg = document.getElementById('productImagePreviewMessage');
        previewField.hidden = false;
        // загружаем изображение с JWT через fetch
        loadProductImageToElement(product.id, previewImg).then((ok) => {
            if (ok) {
                if (msg) msg.hidden = true;
                previewImg.hidden = false;
            } else {
                if (msg) msg.hidden = false;
                previewImg.hidden = true;
            }
        });
    }

    openModal();
}

// Handlers
async function handleChangeStock(id, value) {
    const stock = Number(value);
    if (Number.isNaN(stock) || stock < 0) {
        showToast('Неверное количество', 'error');
        return;
    }
    try {
        await apiChangeStock(id, stock);
        await reloadProducts();
        showToast('Количество обновлено');
    } catch (e) {
        console.error(e);
        showToast('Ошибка обновления количества', 'error');
    }
}

async function handleChangePrice(id, value) {
    const price = Number(value);
    if (Number.isNaN(price) || price < 0) {
        showToast('Неверная цена', 'error');
        return;
    }
    try {
        await apiChangePrice(id, price);
        await reloadProducts();
        showToast('Цена обновлена');
    } catch (e) {
        console.error(e);
        showToast('Ошибка обновления цены', 'error');
    }
}

async function handleDeleteProduct(id) {
    const confirmed = window.confirm('Удалить этот товар?');
    if (!confirmed) return;
    try {
        await apiDeleteProduct(id);
        await reloadProducts();
        showToast('Товар удалён');
    } catch (e) {
        console.error(e);
        showToast('Ошибка удаления товара', 'error');
    }
}

async function reloadProducts() {
    try {
        const list = await fetchProductsByCategory(currentCategory);
        renderProducts(list);
    } catch (e) {
        console.error(e);
        showToast('Не удалось обновить список товаров', 'error');
    }
}

function initCategoryButtons() {
    const list = document.getElementById('categoryList');
    if (!list) return;
    list.addEventListener('click', (e) => {
        const btn = e.target.closest('.category-btn');
        if (!btn) return;
        const cat = btn.dataset.category;
        if (!cat || cat === currentCategory) return;
        setCurrentCategory(cat);
        reloadProducts();
    });
}

function initModalControls() {
    const addBtn = document.getElementById('addProductBtn');
    const emptyAddBtn = document.getElementById('emptyAddBtn');
    const closeBtn = document.getElementById('modalCloseBtn');
    const cancelBtn = document.getElementById('modalCancelBtn');
    const backdrop = document.getElementById('modalBackdrop');
    const modal = document.getElementById('productModal');

    addBtn?.addEventListener('click', openCreateModal);
    emptyAddBtn?.addEventListener('click', openCreateModal);
    closeBtn?.addEventListener('click', closeModal);
    cancelBtn?.addEventListener('click', closeModal);
    backdrop?.addEventListener('click', closeModal);

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && modal && !modal.hidden) {
            closeModal();
        }
    });
}

function initForm() {
    const form = document.getElementById('productForm');
    const errorEl = document.getElementById('modalError');
    const fileBtn = document.getElementById('productImageBtn');
    const fileInput = document.getElementById('productImage');
    const fileName = document.getElementById('productImageName');
    const previewField = document.getElementById('imagePreviewField');
    const previewImg = document.getElementById('productImagePreview');

    if (fileBtn && fileInput) {
        fileBtn.addEventListener('click', () => {
            if (!fileInput.disabled) {
                fileInput.click();
            }
        });
    }

    if (fileInput && fileName) {
        fileInput.addEventListener('change', () => {
            const file = fileInput.files && fileInput.files[0];
            fileName.textContent = file ? file.name : 'Файл не выбран';
            if (previewField && previewImg) {
                if (file) {
                    const reader = new FileReader();
                    reader.onload = (ev) => {
                        previewImg.src = ev.target.result;
                        previewField.hidden = false;
                    };
                    reader.readAsDataURL(file);
                } else {
                    previewImg.src = '';
                    previewField.hidden = true;
                }
            }
        });
    }

    form?.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (!form) return;
        if (errorEl) errorEl.textContent = '';

        const id = Number(document.getElementById('productId').value || 0);
        const name = document.getElementById('productName').value.trim();
        const description = document
            .getElementById('productDescription')
            .value.trim();
        const priceVal = document.getElementById('productPrice').value.trim();
        const stockVal = document.getElementById('productStock').value.trim();
        const category = document.getElementById('productCategory').value;
        const imageInput = document.getElementById('productImage');

        const price = Number(priceVal);
        const stock = Number(stockVal);

        if (!name || !description || !priceVal || !stockVal || !category) {
            if (errorEl) errorEl.textContent = 'Заполните все поля';
            return;
        }
        if (Number.isNaN(price) || price < 0 || Number.isNaN(stock) || stock < 0) {
            if (errorEl) errorEl.textContent = 'Проверьте цену и количество';
            return;
        }

        const submitBtn = document.getElementById('modalSaveBtn');
        if (submitBtn) submitBtn.disabled = true;

        try {
            if (modalMode === 'create') {
                const product = {
                    category,
                    name,
                    description,
                    price,
                    stock,
                    rating: 0,
                };
                const imageFile =
                    imageInput && imageInput.files && imageInput.files[0]
                        ? imageInput.files[0]
                        : null;
                await apiAddProduct({ product, imageFile });
                showToast('Товар добавлен');
            } else {
                const existing = products.find((p) => p.id === id);
                if (!existing) {
                    throw new Error('Товар не найден');
                }
                const product = {
                    id,
                    category: existing.category,
                    name,
                    description,
                    price,
                    stock,
                    rating: existing.rating ?? 0,
                    image_path: existing.image_path ?? '',
                };
                await apiUpdateProduct(product);
                showToast('Товар обновлён');
            }

            closeModal();
            await reloadProducts();
        } catch (e) {
            console.error(e);
            if (errorEl) errorEl.textContent = e.message || 'Ошибка сохранения';
        } finally {
            if (submitBtn) submitBtn.disabled = false;
        }
    });
}

function initLogout() {
    const logoutBtn = document.getElementById('logoutBtn');
    logoutBtn?.addEventListener('click', () => {
        try {
            localStorage.removeItem(LS_ACCESS_TOKEN_KEY);
            localStorage.removeItem(LS_PROFILE_KEY);
        } catch {
            // ignore
        }
        window.location.href = '../login.html';
    });
}

async function initPage() {
    ensureAuthOrRedirect();
    initLogout();
    initCategoryButtons();
    initModalControls();
    initForm();
    setCurrentCategory(currentCategory);
    await reloadProducts();
}

document.addEventListener('DOMContentLoaded', () => {
    initPage().catch((e) => {
        console.error(e);
        showToast('Ошибка загрузки страницы модератора', 'error');
    });
});
