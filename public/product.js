const API_BASE = 'http://localhost:8080/api/v1';
const LS_ACCESS_TOKEN_KEY = 'oss_jwt_access';
const LS_FAVORITES_KEY = 'oss_favorites';

let currentProduct = null;
let currentProductId = null;
let selectedRating = 0;
let favoritesSet = new Set();

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
        }
        window.location.href = 'login.html';
        throw new Error('Не авторизован');
    }
    return res;
}

function getProductIdFromURL() {
    const params = new URLSearchParams(window.location.search);
    const id = params.get('id');
    if (!id) {
        showToast('ID товара не указан', 'error');
        setTimeout(() => {
            window.location.href = 'home.html';
        }, 1500);
        return null;
    }
    return id;
}

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

async function loadProduct(productId) {
    const res = await authorizedFetch(`${API_BASE}/products/${encodeURIComponent(productId)}`);
    if (!res.ok) {
        throw new Error('Не удалось загрузить товар');
    }
    return res.json();
}

async function loadProductImage(productId) {
    const token = getToken();
    if (!token) {
        return 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="400" height="400"%3E%3Crect fill="%23ddd" width="400" height="400"/%3E%3C/svg%3E';
    }

    try {
        const res = await authorizedFetch(`${API_BASE}/products/${encodeURIComponent(productId)}/image`);
        if (!res.ok) {
            throw new Error('Failed to fetch image');
        }
        const blob = await res.blob();
        return URL.createObjectURL(blob);
    } catch (error) {
        console.error('Error loading image:', error);
        return 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="400" height="400"%3E%3Crect fill="%23ddd" width="400" height="400"/%3E%3C/svg%3E';
    }
}

async function loadReviews(productId) {
    const res = await authorizedFetch(`${API_BASE}/reviews/${encodeURIComponent(productId)}`);
    if (!res.ok) {
        throw new Error('Не удалось загрузить отзывы');
    }
    return res.json();
}

async function addToWishlist(productId) {
    const token = getToken();
    if (!token) {
        showToast('Требуется авторизация', 'error');
        return;
    }

    try {
        const res = await authorizedFetch(`${API_BASE}/wish_lists/add_item`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                id: 0,
                wishListId: 1,
                productId: parseInt(productId, 10),
            }),
        });

        if (!res.ok) {
            throw new Error('Не удалось добавить в избранное');
        }

        toggleFavorite(parseInt(productId, 10));
        updateFavoriteButton();
        showToast('Добавлено в избранное');
    } catch (error) {
        console.error('Error adding to wishlist:', error);
        showToast('Ошибка добавления в избранное', 'error');
    }
}

async function addToCart(productId) {
    const token = getToken();
    if (!token) {
        showToast('Требуется авторизация', 'error');
        return;
    }

    try {
        const res = await authorizedFetch(`${API_BASE}/carts/add_item`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                id: 0,
                quantity: 1,
                user_id: 1,
                cart_id: 1,
                product_id: parseInt(productId, 10),
            }),
        });

        if (!res.ok) {
            throw new Error('Не удалось добавить в корзину');
        }

        showToast('Товар добавлен в корзину');
    } catch (error) {
        console.error('Error adding to cart:', error);
        showToast('Ошибка добавления в корзину', 'error');
    }
}

async function submitReview(productId, rating, comment) {
    const token = getToken();
    if (!token) {
        showToast('Требуется авторизация', 'error');
        return;
    }

    try {
        const res = await authorizedFetch(`${API_BASE}/reviews/make_review`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                rating: parseInt(rating, 10),
                comment: comment.trim(),
                user_id: 1,
                product_id: parseInt(productId, 10),
            }),
        });

        if (!res.ok) {
            throw new Error('Не удалось отправить отзыв');
        }

        showToast('Отзыв успешно добавлен');
        document.getElementById('reviewForm').reset();
        selectedRating = 0;
        updateStarsDisplay();

        const reviewsData = await loadReviews(productId);
        renderReviews(reviewsData);
    } catch (error) {
        console.error('Error submitting review:', error);
        showToast('Ошибка отправки отзыва', 'error');
    }
}

function renderProduct(product) {
    const container = document.getElementById('productContainer');
    if (!container) return;

    container.innerHTML = '';

    const main = document.createElement('div');
    main.className = 'product-main';

    const imageSection = document.createElement('div');
    imageSection.className = 'product-image-section';

    const img = document.createElement('img');
    img.className = 'product-main-image';
    img.alt = product.name || 'Product image';

    loadProductImage(product.id).then(url => {
        img.src = url;
    });

    const favBtn = document.createElement('button');
    favBtn.className = 'fav-btn-large';
    favBtn.id = 'favBtnLarge';
    if (isFavorite(product.id)) {
        favBtn.classList.add('active');
    }
    favBtn.innerHTML = '<svg class="fav-icon" viewBox="0 0 24 24"><path d="M12.001 4.529c2.349-2.532 6.379-2.532 8.727 0 2.348 2.531 2.348 6.643 0 9.174l-6.939 7.483a1.25 1.25 0 0 1-1.776 0l-6.94-7.483c-2.347-2.531-2.347-6.643 0-9.174 2.35-2.532 6.38-2.532 8.728 0z"/></svg>';

    favBtn.addEventListener('click', async () => {
        await addToWishlist(product.id);
    });

    imageSection.append(img, favBtn);

    const info = document.createElement('div');
    info.className = 'product-info';

    const categoryTag = document.createElement('div');
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
    description.textContent = product.description || 'Описание отсутствует';

    const price = document.createElement('div');
    price.className = 'product-price-large';
    price.textContent = `${Number(product.price).toFixed(2)} ₸`;

    const actions = document.createElement('div');
    actions.className = 'product-actions';

    const addToCartBtn = document.createElement('button');
    addToCartBtn.className = 'btn primary';
    addToCartBtn.textContent = 'Добавить в корзину';
    addToCartBtn.disabled = product.stock === 0;
    addToCartBtn.addEventListener('click', async () => {
        await addToCart(product.id);
    });

    const addToWishlistBtn = document.createElement('button');
    addToWishlistBtn.className = 'btn secondary';
    addToWishlistBtn.textContent = 'В избранное';
    addToWishlistBtn.addEventListener('click', async () => {
        await addToWishlist(product.id);
    });

    actions.append(addToCartBtn, addToWishlistBtn);

    info.append(categoryTag, name, ratingStock, description, price, actions);

    main.append(imageSection, info);
    container.appendChild(main);
}

function renderReviews(reviewsData) {
    const section = document.getElementById('reviewsSection');
    if (!section) return;

    section.classList.remove('hidden');

    const overview = document.getElementById('reviewsOverview');
    if (overview) {
        overview.innerHTML = '';
        const overallRating = document.createElement('div');
        overallRating.className = 'reviews-overview-rating';
        const ratingVal = Number(reviewsData.overallRating ?? 0).toFixed(1);
        overallRating.innerHTML = `★ ${ratingVal}`;

        const count = document.createElement('div');
        count.className = 'reviews-overview-count';
        count.textContent = `${reviewsData.numberOfReviews} отзывов`;

        overview.append(overallRating, count);
    }

    const list = document.getElementById('reviewsList');
    if (!list) return;
    list.innerHTML = '';

    if (!reviewsData.reviews || reviewsData.reviews.length === 0) {
        const empty = document.createElement('p');
        empty.className = 'muted';
        empty.textContent = 'Отзывов пока нет. Будьте первым!';
        list.appendChild(empty);
        return;
    }

    reviewsData.reviews.forEach(review => {
        const card = document.createElement('div');
        card.className = 'review-card';

        const header = document.createElement('div');
        header.className = 'review-header';

        const user = document.createElement('div');
        user.className = 'review-user';
        user.textContent = `Пользователь #${review.user_id}`;

        const rating = document.createElement('div');
        rating.className = 'review-rating';
        rating.textContent = '★'.repeat(review.rating);

        header.append(user, rating);

        const comment = document.createElement('p');
        comment.className = 'review-comment';
        comment.textContent = review.comment;

        card.append(header, comment);
        list.appendChild(card);
    });
}

function updateFavoriteButton() {
    const favBtn = document.getElementById('favBtnLarge');
    if (!favBtn || !currentProduct) return;
    favBtn.classList.toggle('active', isFavorite(currentProduct.id));
}

function initStarsInput() {
    const starsInput = document.getElementById('starsInput');
    if (!starsInput) return;

    const starBtns = starsInput.querySelectorAll('.star-btn');

    starBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            selectedRating = parseInt(btn.dataset.rating, 10);
            document.getElementById('ratingValue').value = selectedRating;
            updateStarsDisplay();
        });

        btn.addEventListener('mouseenter', () => {
            const hoverRating = parseInt(btn.dataset.rating, 10);
            starBtns.forEach((star, index) => {
                if (index < hoverRating) {
                    star.classList.add('active');
                } else {
                    star.classList.remove('active');
                }
            });
        });
    });

    starsInput.addEventListener('mouseleave', () => {
        updateStarsDisplay();
    });
}

function updateStarsDisplay() {
    const starBtns = document.querySelectorAll('.star-btn');
    starBtns.forEach((btn, index) => {
        if (index < selectedRating) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });
}

function initReviewForm() {
    const form = document.getElementById('reviewForm');
    if (!form) return;

    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        const ratingValue = document.getElementById('ratingValue').value;
        const comment = document.getElementById('reviewComment').value.trim();

        if (!ratingValue || selectedRating === 0) {
            showToast('Пожалуйста, выберите оценку', 'error');
            return;
        }

        if (!comment) {
            showToast('Пожалуйста, напишите комментарий', 'error');
            return;
        }

        await submitReview(currentProductId, selectedRating, comment);
    });
}

function initBackButton() {
    const backBtn = document.getElementById('backBtn');
    if (!backBtn) return;

    backBtn.addEventListener('click', () => {
        window.history.length > 1 ? window.history.back() : (window.location.href = 'home.html');
    });
}

function initHeaderScrollShadow() {
    const header = document.querySelector('.product-header');
    if (!header) return;
    const onScroll = () => {
        if (window.scrollY > 4) {
            header.classList.add('scrolled');
        } else {
            header.classList.remove('scrolled');
        }
    };
    window.addEventListener('scroll', onScroll);
    onScroll();
}

async function initPage() {
    ensureAuth();
    loadFavorites();
    initBackButton();
    initHeaderScrollShadow();
    initStarsInput();
    initReviewForm();

    currentProductId = getProductIdFromURL();
    if (!currentProductId) return;

    try {
        currentProduct = await loadProduct(currentProductId);
        renderProduct(currentProduct);

        const reviewsData = await loadReviews(currentProductId);
        renderReviews(reviewsData);
    } catch (error) {
        console.error('Error loading page:', error);
        showToast('Ошибка загрузки страницы товара', 'error');
        setTimeout(() => {
            window.location.href = 'home.html';
        }, 2000);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    initPage().catch((e) => {
        console.error(e);
        showToast('Ошибка инициализации страницы', 'error');
    });
});
