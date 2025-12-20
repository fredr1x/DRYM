const API_PRODUCTS_BASE = 'http://localhost:8080/api/v1/products';
const API_WISHLIST_BASE = 'http://localhost:8080/api/v1/wish_lists';
const LS_ACCESS_TOKEN_KEY = 'oss_jwt_access';
const LS_PROFILE_KEY = 'oss_profile_user';
const LS_WISHLIST_KEY = 'oss_wishlist';
const DEFAULT_USER_ID = 1;

let currentWishListId = null;
let wishlistItems = new Map(); // productId -> wishListItemId
let searchDebounceId = null;

function getToken() {
    try {
        return localStorage.getItem(LS_ACCESS_TOKEN_KEY);
    } catch {
        return null;
    }
}

function ensureAuth() {
    const token = getToken();
    if (!token) {
        window.location.href = 'login.html';
    }
}

function getUserId() {
    try {
        const stored = localStorage.getItem(LS_PROFILE_KEY);
        if (stored) {
            const user = JSON.parse(stored);
            if (user && user.id) return user.id;
        }
    } catch {}

    const token = getToken();
    if (token) {
        const parts = token.split('.');
        if (parts.length >= 2) {
            try {
                const payloadJson = atob(parts[1].replace(/-/g, '+').replace(/_/g, '/'));
                const payload = JSON.parse(payloadJson);
                if (payload.id) return payload.id;
            } catch {}
        }
    }

    return DEFAULT_USER_ID;
}

function getAuthHeaders(extra = {}) {
    const token = getToken();
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
        try {
            localStorage.removeItem(LS_ACCESS_TOKEN_KEY);
        } catch {}
        window.location.href = 'login.html';
        throw new Error('Не авторизован');
    }
    return res;
}

// Toast
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

// Wishlist API
async function apiGetWishList(userId) {
    const res = await authorizedFetch(`${API_WISHLIST_BASE}/${userId}`);
    if (!res.ok) {
        throw new Error('Не удалось загрузить избранное');
    }
    return res.json();
}

async function apiAddToWishList(payload) {
    const headers = getAuthHeaders({ 'Content-Type': 'application/json' });
    const res = await fetch(`${API_WISHLIST_BASE}/add_item`, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
    });
    if (res.status === 401 || res.status === 403) {
        window.location.href = 'login.html';
        throw new Error('Не авторизован');
    }
    if (!res.ok) {
        throw new Error('Не удалось добавить в избранное');
    }
    return res.json();
}

async function apiRemoveFromWishList(payload) {
    const headers = getAuthHeaders({ 'Content-Type': 'application/json' });
    const res = await fetch(`${API_WISHLIST_BASE}/delete_item`, {
        method: 'DELETE',
        headers,
        body: JSON.stringify(payload),
    });
    if (res.status === 401 || res.status === 403) {
        window.location.href = 'login.html';
        throw new Error('Не авторизован');
    }
    if (!res.ok) {
        throw new Error('Не удалось удалить из избранного');
    }
    return res.json();
}

// Load wishlist
async function loadWishList() {
    const userId = getUserId();
    try {
        const wishlist = await apiGetWishList(userId);
        currentWishListId = wishlist.id;

        if (wishlist.items && Array.isArray(wishlist.items)) {
            wishlistItems.clear();
            wishlist.items.forEach(item => {
                wishlistItems.set(item.product_id, item.id);
            });
        }

        try {
            localStorage.setItem(LS_WISHLIST_KEY, JSON.stringify({
                id: wishlist.id,
                items: wishlist.items || []
            }));
        } catch {}
    } catch (e) {
        console.error('Ошибка загрузки wishlist:', e);
        try {
            const cached = localStorage.getItem(LS_WISHLIST_KEY);
            if (cached) {
                const data = JSON.parse(cached);
                currentWishListId = data.id;
                if (data.items) {
                    wishlistItems.clear();
                    data.items.forEach(item => {
                        wishlistItems.set(item.product_id, item.id);
                    });
                }
            }
        } catch {}
    }
}

function isInWishList(productId) {
    return wishlistItems.has(productId);
}

async function toggleWishList(productId) {
    if (isInWishList(productId)) {
        const wishListItemId = wishlistItems.get(productId);
        try {
            await apiRemoveFromWishList({
                wishListId: currentWishListId,
                wishListItemId: wishListItemId
            });
            wishlistItems.delete(productId);

            try {
                const cached = localStorage.getItem(LS_WISHLIST_KEY);
                if (cached) {
                    const data = JSON.parse(cached);
                    data.items = data.items.filter(item => item.product_id !== productId);
                    localStorage.setItem(LS_WISHLIST_KEY, JSON.stringify(data));
                }
            } catch {}

            return false;
        } catch (e) {
            console.error(e);
            throw e;
        }
    } else {
        try {
            const result = await apiAddToWishList({
                id: 0,
                wishListId: currentWishListId || 0,
                productId: productId
            });

            if (result.id) {
                wishlistItems.set(productId, result.id);
            }

            if (result.wishListId) {
                currentWishListId = result.wishListId;
            }

            try {
                const cached = localStorage.getItem(LS_WISHLIST_KEY);
                const data = cached ? JSON.parse(cached) : { id: currentWishListId, items: [] };
                data.id = currentWishListId;
                data.items.push({ id: result.id, product_id: productId });
                localStorage.setItem(LS_WISHLIST_KEY, JSON.stringify(data));
            } catch {}

            return true;
        } catch (e) {
            console.error(e);
            throw e;
        }
    }
}

// Load product image with JWT
async function loadProductImage(productId, imgElement) {
    if (!imgElement) return;
    try {
        const res = await authorizedFetch(
            `${API_PRODUCTS_BASE}/${encodeURIComponent(productId)}/image`
        );
        if (!res.ok) return;
        const blob = await res.blob();
        const objectUrl = URL.createObjectURL(blob);
        imgElement.src = objectUrl;
    } catch (e) {
        console.error('Ошибка загрузки изображения товара', e);
    }
}

// API
async function fetchTop10() {
    const res = await authorizedFetch(`${API_PRODUCTS_BASE}/top_10`);
    if (!res.ok) {
        throw new Error('Не удалось загрузить топ-10 товаров');
    }
    return res.json();
}

async function searchProducts(keyword) {
    const params = new URLSearchParams();
    if (keyword) params.set('keyword', keyword);
    const res = await authorizedFetch(
        `${API_PRODUCTS_BASE}/search?${params.toString()}`
    );
    if (!res.ok) {
        throw new Error('Не удалось выполнить поиск');
    }
    return res.json();
}

async function filterProducts(filters) {
    const params = new URLSearchParams();
    if (filters.ratingAbove) params.set('ratingAbove', filters.ratingAbove);
    if (filters.minPrice) params.set('minPrice', filters.minPrice);
    if (filters.maxPrice) params.set('maxPrice', filters.maxPrice);
    if (filters.category) params.set('category', filters.category);
    const qs = params.toString();
    const url = qs
        ? `${API_PRODUCTS_BASE}/filter?${qs}`
        : `${API_PRODUCTS_BASE}/filter`;
    const res = await authorizedFetch(url);
    if (!res.ok) {
        throw new Error('Не удалось применить фильтры');
    }
    return res.json();
}

// Render helpers
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

function createSkeletonCard() {
    const sk = document.createElement('div');
    sk.className = 'skeleton-card';
    const inner = document.createElement('div');
    inner.className = 'skeleton-inner';
    sk.appendChild(inner);
    return sk;
}

function renderTopSkeletons() {
    const container = document.getElementById('topProductsContainer');
    if (!container) return;
    container.innerHTML = '';
    for (let i = 0; i < 5; i += 1) {
        const card = document.createElement('div');
        card.className = 'hero-card skeleton-card';
        const inner = document.createElement('div');
        inner.className = 'skeleton-inner';
        card.appendChild(inner);
        container.appendChild(card);
    }
}

function renderGridSkeletons() {
    const grid = document.getElementById('productsGrid');
    const status = document.getElementById('productsStatus');
    if (status) status.textContent = 'Загружаем товары...';
    if (!grid) return;
    grid.innerHTML = '';
    for (let i = 0; i < 8; i += 1) {
        grid.appendChild(createSkeletonCard());
    }
}

function renderProductsGrid(products) {
    const grid = document.getElementById('productsGrid');
    const status = document.getElementById('productsStatus');
    if (!grid) return;
    grid.innerHTML = '';

    if (!products || products.length === 0) {
        if (status) status.textContent = 'Товары не найдены.';
        return;
    }

    if (status) status.textContent = `Найдено товаров: ${products.length}`;

    products.forEach((p) => {
        const card = document.createElement('article');
        card.className = 'product-card';

        const imgWrap = document.createElement('div');
        imgWrap.className = 'product-image-wrapper';
        const img = document.createElement('img');
        img.className = 'product-image';
        img.alt = p.name || 'product image';
        imgWrap.appendChild(img);
        loadProductImage(p.id, img);

        const favBtn = document.createElement('button');
        favBtn.className = 'fav-btn';
        if (isInWishList(p.id)) favBtn.classList.add('active');
        favBtn.innerHTML =
            '<svg class="fav-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12.001 4.529c2.349-2.532 6.379-2.532 8.727 0 2.348 2.531 2.348 6.643 0 9.174l-6.939 7.483a1.25 1.25 0 0 1-1.776 0l-6.94-7.483c-2.347-2.531-2.347-6.643 0-9.174 2.35-2.532 6.38-2.532 8.728 0z"/></svg>';
        favBtn.addEventListener('click', async (e) => {
            e.stopPropagation();
            favBtn.disabled = true;
            try {
                const isAdded = await toggleWishList(p.id);
                favBtn.classList.toggle('active', isInWishList(p.id));
                showToast(isAdded ? 'Добавлено в избранное' : 'Удалено из избранного');
            } catch (err) {
                showToast('Ошибка обновления избранного', 'error');
            } finally {
                favBtn.disabled = false;
            }
        });

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

        const extra = document.createElement('div');
        extra.className = 'product-extra';
        const rating = document.createElement('div');
        rating.className = 'rating';
        const ratingValue = Number(p.rating ?? 0).toFixed(1);
        rating.innerHTML = `★ <span>${ratingValue}</span>`;
        extra.append(rating);

        body.append(title, cat, meta, extra);

        card.append(imgWrap, favBtn, body);

        card.addEventListener('click', (e) => {
            if (e.target.closest('.fav-btn')) return;
            window.location.href = `product.html?id=${p.id}`;
        });

        grid.appendChild(card);
    });
}

function renderTopProducts(products) {
    const container = document.getElementById('topProductsContainer');
    if (!container) return;
    container.innerHTML = '';

    if (!products || products.length === 0) {
        const span = document.createElement('span');
        span.className = 'muted';
        span.textContent = 'Нет популярных товаров.';
        container.appendChild(span);
        return;
    }

    products.forEach((p) => {
        const card = document.createElement('article');
        card.className = 'hero-card';

        const imgWrap = document.createElement('div');
        imgWrap.className = 'product-image-wrapper';
        const img = document.createElement('img');
        img.className = 'product-image';
        img.alt = p.name || 'product image';
        imgWrap.appendChild(img);
        loadProductImage(p.id, img);

        const body = document.createElement('div');
        body.className = 'product-body';
        const title = document.createElement('h3');
        title.className = 'product-title';
        title.textContent = p.name;

        const meta = document.createElement('div');
        meta.className = 'product-meta';
        const price = document.createElement('span');
        price.className = 'product-price';
        price.textContent = `${Number(p.price).toFixed(2)} ₸`;
        const rating = document.createElement('span');
        rating.className = 'rating';
        const ratingValue = Number(p.rating ?? 0).toFixed(1);
        rating.innerHTML = `★ <span>${ratingValue}</span>`;
        meta.append(price, rating);

        body.append(title, meta);

        card.append(imgWrap, body);

        card.addEventListener('click', () => {
            window.location.href = `product.html?id=${p.id}`;
        });

        container.appendChild(card);
    });
}

// Event handlers
function initSearch() {
    const input = document.getElementById('searchInput');
    if (!input) return;

    input.addEventListener('input', () => {
        const value = input.value.trim();
        if (searchDebounceId) {
            clearTimeout(searchDebounceId);
        }
        searchDebounceId = setTimeout(async () => {
            if (!value) {
                return;
            }
            try {
                renderGridSkeletons();
                const products = await searchProducts(value);
                renderProductsGrid(products);
            } catch (e) {
                console.error(e);
                showToast('Ошибка поиска товаров', 'error');
            }
        }, 400);
    });
}

function initCategories() {
    const bar = document.getElementById('categoriesBar');
    if (!bar) return;

    bar.addEventListener('click', async (e) => {
        const pill = e.target.closest('.pill');
        if (!pill) return;
        const category = pill.dataset.category || '';

        bar.querySelectorAll('.pill').forEach((p) => {
            p.classList.toggle('active', p === pill);
        });

        try {
            renderGridSkeletons();
            const filters = {};
            if (category) {
                filters.category = category;
            }
            const products = await filterProducts(filters);
            renderProductsGrid(products);
        } catch (err) {
            console.error(err);
            showToast('Ошибка загрузки товаров по категории', 'error');
        }
    });
}

function initFilters() {
    const form = document.getElementById('filterForm');
    const resetBtn = document.getElementById('resetFiltersBtn');
    if (!form) return;

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const ratingAbove = document.getElementById('filterRating').value.trim();
        const minPrice = document.getElementById('filterMinPrice').value.trim();
        const maxPrice = document.getElementById('filterMaxPrice').value.trim();
        const category = document.getElementById('filterCategory').value.trim();

        const filters = { ratingAbove, minPrice, maxPrice, category };

        try {
            renderGridSkeletons();
            const products = await filterProducts(filters);
            renderProductsGrid(products);
        } catch (err) {
            console.error(err);
            showToast('Ошибка применения фильтров', 'error');
        }
    });

    resetBtn?.addEventListener('click', () => {
        form.reset();
        const status = document.getElementById('productsStatus');
        if (status) status.textContent = '';
        const grid = document.getElementById('productsGrid');
        if (grid) grid.innerHTML = '';
    });
}

function initHeaderScrollShadow() {
    const header = document.querySelector('.app-header');
    if (!header) return;
    const onScroll = () => {
        if (window.scrollY > 4) header.classList.add('scrolled');
        else header.classList.remove('scrolled');
    };
    window.addEventListener('scroll', onScroll);
    onScroll();
}

function initNav() {
    const profileBtn = document.getElementById('profileNavBtn');
    profileBtn?.addEventListener('click', () => {
        window.location.href = 'profile.html';
    });

    const cartBtn = document.querySelector('[data-nav="cart"]');
    cartBtn?.addEventListener('click', () => {
        window.location.href = 'cart.html';
    });

    const favoritesBtn = document.querySelector('[data-nav="favorites"]');
    favoritesBtn?.addEventListener('click', () => {
        showToast('Страница избранного в разработке');
    });

    const ordersBtn = document.querySelector('[data-nav="orders"]');
    ordersBtn?.addEventListener('click', () => {
        showToast('Страница заказов в разработке');
    });
}

async function initPage() {
    ensureAuth();
    await loadWishList();
    initHeaderScrollShadow();
    initNav();
    initSearch();
    initCategories();
    initFilters();

    try {
        renderTopSkeletons();
        const top = await fetchTop10();
        renderTopProducts(top);
    } catch (e) {
        console.error(e);
        showToast('Не удалось загрузить популярные товары', 'error');
    }
}

document.addEventListener('DOMContentLoaded', () => {
    initPage().catch((e) => {
        console.error(e);
        showToast('Ошибка загрузки главной страницы', 'error');
    });
});