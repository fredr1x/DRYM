const API_BASE = 'http://localhost:8080/api/v1';
const LS_ACCESS_TOKEN_KEY = 'oss_jwt_access';
const LS_PROFILE_KEY = 'oss_profile_user';
const LS_FAVORITES_KEY = 'oss_favorites';
const DEFAULT_USER_ID = 1;

let currentProduct = null;
let currentProductId = null;
let favoritesSet = new Set();

// Auth helpers
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
    const headers = { 'Content-Type': 'application/json', ...extra };
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
            localStorage.removeItem(LS_PROFILE_KEY);
        } catch {}
        window.location.href = 'login.html';
        throw new Error('Не авторизован');
    }
    return res;
}

function getUserId() {
    try {
        const stored = localStorage.getItem(LS_PROFILE_KEY);
        if (stored) {
            const user = JSON.parse(stored);
            if (user && user.id) return user.id;
        }
    } catch {}

    // Try JWT
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
    } catch {}
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
async function apiGetProduct(productId) {
    const res = await authorizedFetch(`${API_BASE}/products/${encodeURIComponent(productId)}`);
    if (!res.ok) {
        throw new Error('Не удалось загрузить товар');
    }
    return res.json();
}

async function loadProductImage(productId, imgElement) {
    if (!imgElement) return;
    try {
        const res = await authorizedFetch(`${API_BASE}/products/${encodeURIComponent(productId)}/image`);
        if (!res.ok) return;
        const blob = await res.blob();
        const objectUrl = URL.createObjectURL(blob);
        imgElement.src = objectUrl;
    } catch (e) {
        console.error('Ошибка загрузки изображения товара', e);
    }
}

async function apiGetReviews(productId) {
    const res = await authorizedFetch(`${API_BASE}/reviews/${encodeURIComponent(productId)}`);
    if (!res.ok) {
        throw new Error('Не удалось загрузить отзывы');
    }
    return res.json();
}

async function apiAddReview(payload) {
    const res = await authorizedFetch(`${API_BASE}/reviews/make_review`, {
        method: 'POST',
        body: JSON.stringify(payload),
    });
    if (!res.ok) {
        throw new Error('Не удалось добавить отзыв');
    }
    return res.json();
}

async function apiGetCart(userId) {
    const res = await authorizedFetch(`${API_BASE}/carts/${userId}`);
    if (!res.ok) {
        throw new Error('Не удалось загрузить корзину');
    }
    return res.json();
}

async function apiAddToCart(payload) {
    const res = await authorizedFetch(`${API_BASE}/carts/add_item`, {
        method: 'POST',
        body: JSON.stringify(payload),
    });
    if (!res.ok) {
        throw new Error('Не удалось добавить товар в корзину');
    }
    return res.json();
}

// Category labels
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

// Render product
function renderProduct(product) {
    currentProduct = product;
    const container = document.getElementById('productContainer');
    if (!container) return;

    container.innerHTML = '';

    const main = document.createElement('div');
    main.className = 'product-main';

    // Image section
    const imageSection = document.createElement('div');
    imageSection.className = 'product-image-section';

    const img = document.createElement('img');
    img.className = 'product-main-image';
    img.alt = product.name || 'product';
    loadProductImage(product.id, img);

    const favBtn = document.createElement('button');
    favBtn.className = 'fav-btn-large';
    if (isFavorite(product.id)) favBtn.classList.add('active');
    favBtn.innerHTML = '<svg class="fav-icon" viewBox="0 0 24 24"><path d="M12.001 4.529c2.349-2.532 6.379-2.532 8.727 0 2.348 2.531 2.348 6.643 0 9.174l-6.939 7.483a1.25 1.25 0 0 1-1.776 0l-6.94-7.483c-2.347-2.531-2.347-6.643 0-9.174 2.35-2.532 6.38-2.532 8.728 0z"/></svg>';
    favBtn.addEventListener('click', () => {
        toggleFavorite(product.id);
        favBtn.classList.toggle('active', isFavorite(product.id));
        showToast(isFavorite(product.id) ? 'Добавлено в избранное' : 'Удалено из избранного');
    });

    imageSection.append(img, favBtn);

    // Info section
    const info = document.createElement('div');
    info.className = 'product-info';

    const categoryTag = document.createElement('span');
    categoryTag.className = 'product-category-tag';
    categoryTag.textContent = CATEGORY_LABELS[product.category] || product.category;

    const name = document.createElement('h1');
    name.className = 'product-name';
    name.textContent = product.name;

    const ratingStock = document.createElement('div');
    ratingStock.className = 'product-rating-stock';

    const rating = document.createElement('div');
    rating.className = 'product-rating';
    const ratingValue = Number(product.rating ?? 0).toFixed(1);
    rating.innerHTML = `★ <span>${ratingValue}</span>`;

    const stock = document.createElement('div');
    stock.className = 'product-stock';
    if (product.stock > 10) {
        stock.classList.add('in-stock');
        stock.textContent = `В наличии: ${product.stock} шт.`;
    } else if (product.stock > 0) {
        stock.classList.add('low-stock');
        stock.textContent = `Осталось: ${product.stock} шт.`;
    } else {
        stock.classList.add('out-of-stock');
        stock.textContent = 'Нет в наличии';
    }

    ratingStock.append(rating, stock);

    const description = document.createElement('p');
    description.className = 'product-description';
    description.textContent = product.description || 'Описание отсутствует.';

    const price = document.createElement('div');
    price.className = 'product-price-large';
    price.textContent = `${Number(product.price).toFixed(2)} ₸`;

    const actions = document.createElement('div');
    actions.className = 'product-actions';

    const addToCartBtn = document.createElement('button');
    addToCartBtn.className = 'btn primary';
    addToCartBtn.textContent = 'Добавить в корзину';
    addToCartBtn.disabled = product.stock <= 0;
    addToCartBtn.addEventListener('click', handleAddToCart);

    const goToCartBtn = document.createElement('button');
    goToCartBtn.className = 'btn secondary';
    goToCartBtn.textContent = 'Перейти в корзину';
    goToCartBtn.addEventListener('click', () => {
        window.location.href = 'cart.html';
    });

    actions.append(addToCartBtn, goToCartBtn);

    info.append(categoryTag, name, ratingStock, description, price, actions);

    main.append(imageSection, info);
    container.appendChild(main);
}

// Reviews
function renderReviews(reviewsData) {
    const reviewsSection = document.getElementById('reviewsSection');
    const reviewsList = document.getElementById('reviewsList');
    const reviewsOverview = document.getElementById('reviewsOverview');

    if (!reviewsSection || !reviewsList || !reviewsOverview) return;

    reviewsSection.classList.remove('hidden');

    // Проверяем структуру данных - может быть объект с полями или массив
    let reviews = [];
    let overallRating = 0;
    let numberOfReviews = 0;

    if (reviewsData) {
        if (Array.isArray(reviewsData)) {
            // Если пришёл просто массив
            reviews = reviewsData;
            numberOfReviews = reviews.length;
        } else if (reviewsData.reviews && Array.isArray(reviewsData.reviews)) {
            // Если объект с полем reviews
            reviews = reviewsData.reviews;
            overallRating = reviewsData.overallRating || 0;
            numberOfReviews = reviewsData.numberOfReviews || reviews.length;
        }
    }

    // Overview
    if (numberOfReviews > 0) {
        const displayRating = overallRating > 0 ? overallRating.toFixed(1) : (
            reviews.reduce((sum, r) => sum + Number(r.rating || 0), 0) / reviews.length
        ).toFixed(1);

        reviewsOverview.innerHTML = `
            <div class="reviews-overview-rating">★ ${displayRating}</div>
            <div class="reviews-overview-count">(${numberOfReviews} ${numberOfReviews === 1 ? 'отзыв' : 'отзывов'})</div>
        `;
    } else {
        reviewsOverview.innerHTML = '<div class="reviews-overview-count">Нет отзывов</div>';
    }

    // List
    reviewsList.innerHTML = '';
    if (!reviews || reviews.length === 0) {
        const empty = document.createElement('p');
        empty.className = 'muted';
        empty.textContent = 'Будьте первым, кто оставит отзыв!';
        reviewsList.appendChild(empty);
        return;
    }

    reviews.forEach((review) => {
        const card = document.createElement('div');
        card.className = 'review-card';

        const header = document.createElement('div');
        header.className = 'review-header';

        const user = document.createElement('div');
        user.className = 'review-user';
        user.textContent = review.user_name || `Пользователь ${review.user_id || ''}`;

        const rating = document.createElement('div');
        rating.className = 'review-rating';
        rating.textContent = '★'.repeat(Number(review.rating || 0));

        header.append(user, rating);

        const comment = document.createElement('p');
        comment.className = 'review-comment';
        comment.textContent = review.comment || '';

        card.append(header, comment);
        reviewsList.appendChild(card);
    });
}

// Handlers
async function handleAddToCart() {
    if (!currentProduct) return;

    const userId = getUserId();
    if (!userId) {
        showToast('Необходимо войти в систему', 'error');
        return;
    }

    const addToCartBtn = document.querySelector('.product-actions .btn.primary');
    if (addToCartBtn) addToCartBtn.disabled = true;

    try {
        // Get cart
        let cartData;
        try {
            cartData = await apiGetCart(userId);
        } catch {
            // Cart might not exist yet
        }

        const cartId = cartData?.id || 0;

        const payload = {
            id: 0,
            quantity: 1,
            user_id: userId,
            cart_id: cartId,
            product_id: currentProduct.id,
        };

        await apiAddToCart(payload);
        showToast('Товар добавлен в корзину');
    } catch (e) {
        console.error(e);
        showToast(e.message || 'Ошибка добавления в корзину', 'error');
    } finally {
        if (addToCartBtn) addToCartBtn.disabled = false;
    }
}

// Review form
function initReviewForm() {
    const starsInput = document.getElementById('starsInput');
    const ratingValue = document.getElementById('ratingValue');
    const form = document.getElementById('reviewForm');

    if (starsInput && ratingValue) {
        starsInput.addEventListener('click', (e) => {
            const btn = e.target.closest('.star-btn');
            if (!btn) return;

            const rating = btn.dataset.rating;
            ratingValue.value = rating;

            // Update UI
            starsInput.querySelectorAll('.star-btn').forEach((star, idx) => {
                if (idx < Number(rating)) {
                    star.classList.add('active');
                } else {
                    star.classList.remove('active');
                }
            });
        });
    }

    if (form) {
        form.addEventListener('submit', async (e) => {
            e.preventDefault();

            const rating = ratingValue?.value;
            const comment = document.getElementById('reviewComment')?.value.trim();

            if (!rating || !comment) {
                showToast('Заполните все поля', 'error');
                return;
            }

            const userId = getUserId();
            const payload = {
                rating: Number(rating),
                comment,
                user_id: userId,
                product_id: currentProductId,
            };

            const submitBtn = form.querySelector('button[type="submit"]');
            if (submitBtn) submitBtn.disabled = true;

            try {
                await apiAddReview(payload);
                showToast('Отзыв добавлен');
                form.reset();
                starsInput?.querySelectorAll('.star-btn').forEach((s) => s.classList.remove('active'));

                // Reload reviews
                const reviews = await apiGetReviews(currentProductId);
                renderReviews(reviews);
            } catch (e) {
                console.error(e);
                showToast(e.message || 'Ошибка добавления отзыва', 'error');
            } finally {
                if (submitBtn) submitBtn.disabled = false;
            }
        });
    }
}

// Back button
function initBackButton() {
    const backBtn = document.getElementById('backBtn');
    if (backBtn) {
        backBtn.addEventListener('click', () => {
            window.history.back();
        });
    }
}

// Header scroll shadow
function initHeaderScrollShadow() {
    const header = document.querySelector('.product-header');
    if (!header) return;

    const onScroll = () => {
        if (window.scrollY > 4) header.classList.add('scrolled');
        else header.classList.remove('scrolled');
    };

    window.addEventListener('scroll', onScroll);
    onScroll();
}

// Load page
async function loadProductPage() {
    const params = new URLSearchParams(window.location.search);
    const productId = params.get('id');

    if (!productId) {
        showToast('Товар не найден', 'error');
        setTimeout(() => {
            window.location.href = 'home.html';
        }, 1500);
        return;
    }

    currentProductId = Number(productId);

    try {
        const product = await apiGetProduct(productId);
        renderProduct(product);

        // Load reviews
        try {
            const reviews = await apiGetReviews(productId);
            renderReviews(reviews);
        } catch (e) {
            console.error('Ошибка загрузки отзывов', e);
            // Don't fail the whole page if reviews fail
            const reviewsSection = document.getElementById('reviewsSection');
            if (reviewsSection) reviewsSection.classList.remove('hidden');
        }
    } catch (e) {
        console.error(e);
        showToast('Не удалось загрузить товар', 'error');
        setTimeout(() => {
            window.location.href = 'home.html';
        }, 2000);
    }
}

// Init
async function init() {
    ensureAuth();
    loadFavorites();
    initHeaderScrollShadow();
    initBackButton();
    initReviewForm();
    await loadProductPage();
}

document.addEventListener('DOMContentLoaded', () => {
    init().catch((e) => {
        console.error(e);
        showToast('Ошибка загрузки страницы', 'error');
    });
});
