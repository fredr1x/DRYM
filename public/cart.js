const API_BASE = 'http://localhost:8080/api/v1';
const LS_ACCESS_TOKEN_KEY = 'oss_jwt_access';
const LS_PROFILE_KEY = 'oss_profile_user';

let currentUser = null;
let cartData = null;
let cartItems = [];
let productsData = new Map();

// Auth & helpers
function getAccessToken() {
    try {
        return localStorage.getItem(LS_ACCESS_TOKEN_KEY);
    } catch {
        return null;
    }
}

function ensureAuth() {
    const token = getAccessToken();
    if (!token) {
        window.location.href = 'login.html';
        throw new Error('Не авторизован');
    }
}

function getAuthHeaders(extra = {}) {
    const token = getAccessToken();
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

// User ID
async function getUserId() {
    // Пытаемся получить из localStorage
    try {
        const stored = localStorage.getItem(LS_PROFILE_KEY);
        if (stored) {
            const user = JSON.parse(stored);
            if (user && user.id) return user.id;
        }
    } catch {}

    // Пытаемся декодировать из JWT
    const token = getAccessToken();
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

    // Если не получили - запрашиваем у backend (нужен отдельный endpoint /me или подобный)
    // Для демо используем fallback
    return 1;
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

// API calls
async function apiGetCart(userId) {
    const res = await authorizedFetch(`${API_BASE}/carts/${userId}`);
    if (!res.ok) {
        throw new Error('Не удалось загрузить корзину');
    }
    return res.json();
}

async function apiGetCartItems(userId) {
    const res = await authorizedFetch(`${API_BASE}/carts/${userId}/cart-items`);
    if (!res.ok) {
        throw new Error('Не удалось загрузить товары корзины');
    }
    return res.json();
}

async function apiGetTotalCartItems(userId) {
    const res = await authorizedFetch(`${API_BASE}/carts/${userId}/total_cart_items`);
    if (!res.ok) {
        throw new Error('Не удалось получить количество товаров');
    }
    return res.json();
}

async function apiGetProduct(productId) {
    const res = await authorizedFetch(`${API_BASE}/products/${productId}`);
    if (!res.ok) {
        throw new Error('Не удалось загрузить товар');
    }
    return res.json();
}

async function loadProductImage(productId, imgElement) {
    if (!imgElement) return;
    try {
        const res = await authorizedFetch(`${API_BASE}/products/${productId}/image`);
        if (!res.ok) return;
        const blob = await res.blob();
        const objectUrl = URL.createObjectURL(blob);
        imgElement.src = objectUrl;
    } catch (e) {
        console.error('Ошибка загрузки изображения товара', e);
    }
}

async function apiAddItem(payload) {
    const res = await authorizedFetch(`${API_BASE}/carts/add_item`, {
        method: 'POST',
        body: JSON.stringify(payload),
    });
    if (!res.ok) {
        throw new Error('Не удалось добавить товар');
    }
    return res.json();
}

async function apiDeleteItem(payload) {
    const res = await authorizedFetch(`${API_BASE}/carts/delete_item`, {
        method: 'DELETE',
        body: JSON.stringify(payload),
    });
    if (!res.ok) {
        throw new Error('Не удалось удалить товар');
    }
    return res.json();
}

async function apiMakeOrder(payload) {
    const res = await authorizedFetch(`${API_BASE}/orders/make_order`, {
        method: 'POST',
        body: JSON.stringify(payload),
    });
    if (!res.ok) {
        throw new Error('Не удалось создать заказ');
    }
    return res.json();
}

async function apiPayOrder(orderId, payload) {
    const res = await authorizedFetch(`${API_BASE}/orders/${orderId}/pay`, {
        method: 'POST',
        body: JSON.stringify(payload),
    });
    if (!res.ok) {
        throw new Error('Не удалось оплатить заказ');
    }
    return res.json();
}

// UI
function hideSkeletons() {
    const skeleton = document.getElementById('cartSkeleton');
    if (skeleton) skeleton.style.display = 'none';
}

function showEmptyCart() {
    hideSkeletons();
    const emptyCart = document.getElementById('emptyCart');
    const cartItems = document.getElementById('cartItems');
    const cartSummary = document.getElementById('cartSummary');
    const cartBadge = document.getElementById('cartBadge');
    if (emptyCart) emptyCart.classList.remove('hidden');
    if (cartItems) cartItems.classList.add('hidden');
    if (cartSummary) cartSummary.classList.add('hidden');
    if (cartBadge) cartBadge.classList.add('hidden');
}

function showCartContent() {
    hideSkeletons();
    const emptyCart = document.getElementById('emptyCart');
    const cartItems = document.getElementById('cartItems');
    const cartSummary = document.getElementById('cartSummary');
    const cartBadge = document.getElementById('cartBadge');
    if (emptyCart) emptyCart.classList.add('hidden');
    if (cartItems) cartItems.classList.remove('hidden');
    if (cartSummary) cartSummary.classList.remove('hidden');
    if (cartBadge) cartBadge.classList.remove('hidden');
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

function renderCartItems() {
    const container = document.getElementById('cartItems');
    if (!container) return;

    container.innerHTML = '';

    if (!cartItems || cartItems.length === 0) {
        showEmptyCart();
        return;
    }

    showCartContent();

    cartItems.forEach((item) => {
        const product = productsData.get(item.product_id);
        if (!product) return;

        const card = document.createElement('div');
        card.className = 'cart-item';
        card.dataset.itemId = item.id;

        // Image
        const imageWrapper = document.createElement('div');
        imageWrapper.className = 'cart-item-image';
        const img = document.createElement('img');
        img.alt = product.name || 'product';
        imageWrapper.appendChild(img);
        loadProductImage(product.id, img);

        // Info
        const info = document.createElement('div');
        info.className = 'cart-item-info';

        const name = document.createElement('h3');
        name.className = 'cart-item-name';
        name.textContent = product.name;

        const category = document.createElement('div');
        category.className = 'cart-item-category';
        category.textContent = CATEGORY_LABELS[product.category] || product.category;

        const price = document.createElement('div');
        price.className = 'cart-item-price';
        const subtotal = product.price * item.quantity;
        price.textContent = `${subtotal.toFixed(2)} ₸`;

        info.append(name, category, price);

        // Actions
        const actions = document.createElement('div');
        actions.className = 'cart-item-actions';

        const quantityControls = document.createElement('div');
        quantityControls.className = 'quantity-controls';

        const minusBtn = document.createElement('button');
        minusBtn.className = 'quantity-btn';
        minusBtn.textContent = '−';
        minusBtn.disabled = item.quantity <= 1;
        minusBtn.addEventListener('click', () => handleDecrement(item));

        const quantityValue = document.createElement('span');
        quantityValue.className = 'quantity-value';
        quantityValue.textContent = item.quantity;

        const plusBtn = document.createElement('button');
        plusBtn.className = 'quantity-btn';
        plusBtn.textContent = '+';
        plusBtn.addEventListener('click', () => handleIncrement(item));

        quantityControls.append(minusBtn, quantityValue, plusBtn);

        const removeBtn = document.createElement('button');
        removeBtn.className = 'remove-btn';
        removeBtn.textContent = 'Удалить';
        removeBtn.addEventListener('click', () => handleRemoveItem(item));

        actions.append(quantityControls, removeBtn);

        card.append(imageWrapper, info, actions);
        container.appendChild(card);
    });

    updateSummary();
}

function updateSummary() {
    const totalItemsEl = document.getElementById('totalItems');
    const summaryItemsCount = document.getElementById('summaryItemsCount');
    const summaryTotalPrice = document.getElementById('summaryTotalPrice');

    const totalItems = cartItems.reduce((sum, item) => sum + item.quantity, 0);
    let totalPrice = 0;

    cartItems.forEach((item) => {
        const product = productsData.get(item.product_id);
        if (product) {
            totalPrice += product.price * item.quantity;
        }
    });

    if (totalItemsEl) totalItemsEl.textContent = totalItems;
    if (summaryItemsCount) summaryItemsCount.textContent = `${totalItems} шт.`;
    if (summaryTotalPrice) summaryTotalPrice.textContent = `${totalPrice.toFixed(2)} ₸`;
}

// Handlers
async function handleIncrement(item) {
    const userId = await getUserId();
    const payload = {
        product_id: item.product_id,
        quantity: 1,
        user_id: userId,
        cart_id: item.cart_id,
    };

    try {
        await apiAddItem(payload);
        await loadCart();
        showToast('Количество увеличено');
    } catch (e) {
        console.error(e);
        showToast('Ошибка увеличения количества', 'error');
    }
}

async function handleDecrement(item) {
    if (item.quantity <= 1) return;
    // Уменьшение - это удаление одного экземпляра
    // Но API delete_item удаляет всю позицию
    // Для уменьшения нужно либо отдельный endpoint, либо add с отрицательным quantity
    // Так как его нет в спецификации, просто блокируем кнопку при quantity = 1
    showToast('Используйте кнопку "Удалить" для удаления товара', 'error');
}

async function handleRemoveItem(item) {
    const confirmed = confirm('Удалить этот товар из корзины?');
    if (!confirmed) return;

    const payload = {
        cartId: item.cart_id,
        cartItemId: item.id,
    };

    try {
        await apiDeleteItem(payload);
        await loadCart();
        showToast('Товар удалён из корзины');
    } catch (e) {
        console.error(e);
        showToast('Ошибка удаления товара', 'error');
    }
}

async function handleCheckout() {
    if (!cartItems || cartItems.length === 0) {
        showToast('Корзина пуста', 'error');
        return;
    }

    const userId = await getUserId();
    if (!cartData || !cartData.id) {
        showToast('Ошибка: корзина не найдена', 'error');
        return;
    }

    const checkoutBtn = document.getElementById('checkoutBtn');
    if (checkoutBtn) checkoutBtn.disabled = true;

    try {
        // Создаём заказ
        const orderPayload = {
            user_id: userId,
            cart_id: cartData.id,
        };
        const order = await apiMakeOrder(orderPayload);

        if (!order || !order.id) {
            throw new Error('Заказ не создан');
        }

        showToast('Заказ создан, производим оплату...');

        // Оплачиваем заказ
        const payPayload = {
            user_id: userId,
        };
        await apiPayOrder(order.id, payPayload);

        showToast('Заказ успешно оплачен!');

        // Перезагружаем корзину (должна быть пустой)
        setTimeout(async () => {
            await loadCart();
        }, 1000);

    } catch (e) {
        console.error(e);
        showToast(e.message || 'Ошибка оформления заказа', 'error');
    } finally {
        if (checkoutBtn) checkoutBtn.disabled = false;
    }
}

// Load cart
async function loadCart() {
    try {
        const userId = await getUserId();

        // Получаем корзину
        cartData = await apiGetCart(userId);

        // Получаем товары в корзине
        const items = await apiGetCartItems(userId);
        cartItems = Array.isArray(items) ? items : [];

        // Загружаем данные о товарах
        productsData.clear();
        const productPromises = cartItems.map(async (item) => {
            try {
                const product = await apiGetProduct(item.product_id);
                productsData.set(item.product_id, product);
            } catch (e) {
                console.error('Ошибка загрузки товара', item.product_id, e);
            }
        });

        await Promise.all(productPromises);

        // Рендерим
        renderCartItems();

    } catch (e) {
        console.error(e);
        hideSkeletons();
        showToast('Не удалось загрузить корзину', 'error');
        showEmptyCart();
    }
}

// Init
function initCheckoutButton() {
    const btn = document.getElementById('checkoutBtn');
    if (btn) {
        btn.addEventListener('click', handleCheckout);
    }
}

async function init() {
    ensureAuth();
    initCheckoutButton();
    await loadCart();
}

document.addEventListener('DOMContentLoaded', () => {
    init().catch((e) => {
        console.error(e);
        showToast('Ошибка загрузки страницы', 'error');
    });
});
