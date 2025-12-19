const API_PRODUCTS_BASE = 'http://localhost:8081/api/v1/products';
const LS_ACCESS_TOKEN_KEY = 'oss_jwt_access';
const LS_FAVORITES_KEY = 'oss_favorites';

let favoritesSet = new Set();
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
        } catch {
            // ignore
        }
        window.location.href = 'login.html';
        throw new Error('Не авторизован');
    }
    return res;
}

// Функция для получения изображения с JWT токеном
async function getProductImageUrl(productId) {
    const token = getToken();
    if (!token) {
        return 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="200" height="200"%3E%3Crect fill="%23ddd" width="200" height="200"/%3E%3C/svg%3E';
    }

    try {
        const res = await authorizedFetch(
            `${API_PRODUCTS_BASE}/${encodeURIComponent(productId)}/image`
        );

        if (!res.ok) {
            throw new Error('Failed to fetch image');
        }

        const blob = await res.blob();
        return URL.createObjectURL(blob);
    } catch (error) {
        console.error('Error loading image:', error);
        return 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="200" height="200"%3E%3Crect fill="%23ddd" width="200" height="200"/%3E%3C/svg%3E';
    }
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

// Favorites
function loadFavorites() {
    try {
        const raw = localStorage.getItem(LS_FAVORITES_KEY);
        if (!raw) {
            favoritesSet = new Set();
            return;
        }
        const arr = JSON.parse(raw);
        favoritesSet = new Set(Array.isArray(arr) ? arr : []);
    } catch {
        favoritesSet = new Set();
    }
}

function saveFavorites() {
    try {
        localStorage.setItem(LS_FAVORITES_KEY, JSON.stringify([...favoritesSet]));
    } catch {
        // ignore
    }
}

function isFavorite(id) {
    return favoritesSet.has(id);
}

function toggleFavorite(id) {
    if (favoritesSet.has(id)) {
        favoritesSet.delete(id);
    } else {
        favoritesSet.add(id);
    }
    saveFavorites();
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

async function renderProductsGrid(products) {
    const grid = document.getElementById('productsGrid');
    const status = document.getElementById('productsStatus');
    if (!grid) return;
    grid.innerHTML = '';

    if (!products || products.length === 0) {
        if (status) status.textContent = 'Товары не найдены.';
        return;
    }

    if (status) status.textContent = `Найдено товаров: ${products.length}`;

    for (const p of products) {
        const card = document.createElement('article');
        card.className = 'product-card';

        const imgWrap = document.createElement('div');
        imgWrap.className = 'product-image-wrapper';
        const img = document.createElement('img');
        img.className = 'product-image';
        img.alt = p.name || 'product image';

        // Загружаем изображение с JWT токеном
        getProductImageUrl(p.id).then(url => {
            img.src = url;
        });

        imgWrap.appendChild(img);

        const favBtn = document.createElement('button');
        favBtn.className = 'fav-btn';
        if (isFavorite(p.id)) favBtn.classList.add('active');
        favBtn.innerHTML =
            '<svg class="fav-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12.001 4.529c2.349-2.532 6.379-2.532 8.727 0 2.348 2.531 2.348 6.643 0 9.174l-6.939 7.483a1.25 1.25 0 0 1-1.776 0l-6.94-7.483c-2.347-2.531-2.347-6.643 0-9.174 2.35-2.532 6.38-2.532 8.728 0z"/></svg>';
        favBtn.addEventListener('click', () => {
            toggleFavorite(p.id);
            favBtn.classList.toggle('active', isFavorite(p.id));
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

        const addToCartBtn = document.createElement('button');
        addToCartBtn.className = 'add-to-cart-btn';
        addToCartBtn.textContent = 'В корзину';
        addToCartBtn.addEventListener('click', async () => {
            await addProductToCart(p.id);
        });

        body.append(title, cat, meta, extra, addToCartBtn);

        card.append(imgWrap, favBtn, body);
        grid.appendChild(card);
    }
}

async function renderTopProducts(products) {
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

    for (const p of products) {
        const card = document.createElement('article');
        card.className = 'hero-card';

        const imgWrap = document.createElement('div');
        imgWrap.className = 'product-image-wrapper';
        const img = document.createElement('img');
        img.className = 'product-image';
        img.alt = p.name || 'product image';

        // Загружаем изображение с JWT токеном
        getProductImageUrl(p.id).then(url => {
            img.src = url;
        });

        imgWrap.appendChild(img);

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

        const addToCartBtn = document.createElement('button');
        addToCartBtn.className = 'add-to-cart-btn';
        addToCartBtn.textContent = 'В корзину';
        addToCartBtn.style.marginTop = '8px';
        addToCartBtn.style.width = '100%';
        addToCartBtn.addEventListener('click', async () => {
            await addProductToCart(p.id);
        });

        body.append(title, meta, addToCartBtn);

        card.append(imgWrap, body);
        container.appendChild(card);
    }
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
                // если поиск пустой, можно просто не перетирать текущий список
                return;
            }
            try {
                renderGridSkeletons();
                const products = await searchProducts(value);
                await renderProductsGrid(products);
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
            const filters = { category };
            const products = await filterProducts(filters);
            await renderProductsGrid(products);
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
            await renderProductsGrid(products);
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

    const cartBtn = document.getElementById('cartNavBtn');
    cartBtn?.addEventListener('click', () => {
        window.location.href = 'cart.html';
    });
}

// Simple function to add product to cart
async function addProductToCart(productId) {
    const API_CART_BASE = 'http://localhost:8081/api/v1/carts';
    const LS_ACCESS_TOKEN_KEY = 'oss_jwt_access';
    const LS_PROFILE_KEY = 'oss_profile_user';
    const DEFAULT_USER_ID = 1;

    function getUserId() {
        try {
            const stored = JSON.parse(localStorage.getItem(LS_PROFILE_KEY));
            if (stored && stored.id) return stored.id;
        } catch {
            // ignore
        }
        return DEFAULT_USER_ID;
    }

    function getToken() {
        try {
            return localStorage.getItem(LS_ACCESS_TOKEN_KEY);
        } catch {
            return null;
        }
    }

    function getAuthHeaders() {
        const token = getToken();
        const headers = { 'Content-Type': 'application/json' };
        if (token) {
            headers.Authorization = `Bearer ${token}`;
        }
        return headers;
    }

    const userId = getUserId();
    if (!userId) {
        showToast('Необходимо войти в систему', 'error');
        return;
    }

    try {
        // Get cart first
        let cartData;
        try {
            const cartRes = await fetch(`${API_CART_BASE}/${encodeURIComponent(userId)}`, {
                headers: getAuthHeaders(),
            });
            if (cartRes.ok) {
                cartData = await cartRes.json();
            }
        } catch {
            // Cart might not exist yet
        }

        const cartId = cartData?.id || 0;

        const itemData = {
            id: 0,
            quantity: 1,
            user_id: userId,
            cart_id: cartId,
            product_id: productId,
        };

        const res = await fetch(`${API_CART_BASE}/add_item`, {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify(itemData),
        });

        if (!res.ok) {
            if (res.status === 401 || res.status === 403) {
                try {
                    localStorage.removeItem(LS_ACCESS_TOKEN_KEY);
                } catch {
                    // ignore
                }
                window.location.href = 'login.html';
                return;
            }
            const errorText = await res.text().catch(() => 'Не удалось добавить товар в корзину');
            throw new Error(errorText || 'Не удалось добавить товар в корзину');
        }

        showToast('Товар добавлен в корзину');
    } catch (err) {
        console.error('Error adding to cart:', err);
        showToast(err.message || 'Ошибка добавления товара', 'error');
    }
}

async function initPage() {
    ensureAuth();
    loadFavorites();
    initHeaderScrollShadow();
    initNav();
    initSearch();
    initCategories();
    initFilters();

    try {
        renderTopSkeletons();
        const top = await fetchTop10();
        await renderTopProducts(top);
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
