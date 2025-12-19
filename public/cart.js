// Cart page functionality
const API_CART_BASE = 'http://localhost:8081/api/v1/carts';
const API_PRODUCTS_BASE = 'http://localhost:8081/api/v1/products';
const LS_ACCESS_TOKEN_KEY = 'oss_jwt_access';
const LS_PROFILE_KEY = 'oss_profile_user';
const DEFAULT_USER_ID = 1;

// Cart state
let cartData = null;
let cartItems = [];

// Get user ID from localStorage
function getUserId() {
    try {
        const stored = JSON.parse(localStorage.getItem(LS_PROFILE_KEY));
        if (stored && stored.id) return stored.id;
    } catch {
        // ignore
    }
    return DEFAULT_USER_ID;
}

// Get access token
function getAccessToken() {
    try {
        return localStorage.getItem(LS_ACCESS_TOKEN_KEY);
    } catch {
        return null;
    }
}

// Get auth headers
function getAuthHeaders(extra = {}) {
    const token = getAccessToken();
    const headers = { 'Content-Type': 'application/json', ...extra };
    if (token) {
        headers.Authorization = `Bearer ${token}`;
    }
    return headers;
}

// Authorized fetch
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

// Toast notification
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

// Ensure auth
function ensureAuth() {
    const token = getAccessToken();
    if (!token) {
        window.location.href = 'login.html';
    }
}

// API functions
async function apiGetCart(userId) {
    const res = await authorizedFetch(`${API_CART_BASE}/${encodeURIComponent(userId)}`);
    if (!res.ok) {
        throw new Error('Не удалось загрузить корзину');
    }
    return res.json();
}

async function apiGetCartItems(userId) {
    const res = await authorizedFetch(`${API_CART_BASE}/${encodeURIComponent(userId)}/cart-items`);
    if (!res.ok) {
        throw new Error('Не удалось загрузить товары корзины');
    }
    return res.json();
}

async function apiRemoveItemFromCart(cartId, cartItemId) {
    const res = await authorizedFetch(`${API_CART_BASE}/delete_item`, {
        method: 'DELETE',
        body: JSON.stringify({
            cartId: cartId,
            cartItemId: cartItemId,
        }),
    });
    if (!res.ok) {
        throw new Error('Не удалось удалить товар из корзины');
    }
    return res.json();
}

// Load cart data
async function loadCart() {
    const userId = getUserId();
    if (!userId) {
        showEmptyState();
        return;
    }

    try {
        cartData = await apiGetCart(userId);
        cartItems = await apiGetCartItems(userId);

        if (!cartItems || cartItems.length === 0) {
            showEmptyState();
        } else {
            showCartContent();
            renderCartItems();
            updateCartSummary();
        }
    } catch (err) {
        console.error('Error loading cart:', err);
        if (err.message.includes('Не удалось загрузить')) {
            showEmptyState();
        } else {
            showToast('Ошибка загрузки корзины', 'error');
        }
    }
}

// Show empty state
function showEmptyState() {
    const emptyState = document.getElementById('cartEmptyState');
    const cartContent = document.getElementById('cartContent');
    if (emptyState) emptyState.style.display = 'block';
    if (cartContent) cartContent.style.display = 'none';
}

// Show cart content
function showCartContent() {
    const emptyState = document.getElementById('cartEmptyState');
    const cartContent = document.getElementById('cartContent');
    if (emptyState) emptyState.style.display = 'none';
    if (cartContent) cartContent.style.display = 'flex';
}

// Render cart items
function renderCartItems() {
    const container = document.getElementById('cartItemsContainer');
    if (!container) return;

    container.innerHTML = '';

    cartItems.forEach((item) => {
        const card = createCartItemCard(item);
        container.appendChild(card);
    });
}

// Create cart item card
function createCartItemCard(item) {
    const card = document.createElement('div');
    card.className = 'cart-item';
    card.dataset.cartItemId = item.id;

    card.innerHTML = `
        <div class="cart-item-image">
            <img src="" alt="Product" class="cart-item-img" data-product-id="${item.product_id}">
        </div>
        <div class="cart-item-info">
            <h4 class="cart-item-name">Загрузка...</h4>
            <div class="cart-item-meta">
                <span class="cart-item-price">—</span>
                <span class="cart-item-stock">—</span>
            </div>
        </div>
        <div class="cart-item-controls">
            <div class="quantity-controls">
                <button class="quantity-btn minus" data-cart-item-id="${item.id}">−</button>
                <span class="quantity-value">${item.quantity}</span>
                <button class="quantity-btn plus" data-cart-item-id="${item.id}">+</button>
            </div>
            <button class="cart-item-remove" data-cart-item-id="${item.id}" aria-label="Удалить">
                <svg viewBox="0 0 24 24" width="18" height="18">
                    <path d="M9 3a1 1 0 0 0-.894.553L7.382 5H4a1 1 0 1 0 0 2h.278l.84 11.207A3 3 0 0 0 8.11 21h7.78a3 3 0 0 0 2.992-2.793L19.722 7H20a1 1 0 1 0 0-2h-3.382l-.724-1.447A1 1 0 0 0 15 3H9z"/>
                </svg>
            </button>
        </div>
    `;

    // Load product details
    loadProductDetails(item.product_id, card);

    return card;
}

// Load product details for cart item
async function loadProductDetails(productId, cardElement) {
    try {
        const res = await authorizedFetch(`${API_PRODUCTS_BASE}/${encodeURIComponent(productId)}`);
        
        if (!res.ok) {
            throw new Error('Failed to load product');
        }

        const product = await res.json();
        const nameEl = cardElement.querySelector('.cart-item-name');
        const priceEl = cardElement.querySelector('.cart-item-price');
        const stockEl = cardElement.querySelector('.cart-item-stock');
        const imgEl = cardElement.querySelector('.cart-item-img');

        if (nameEl) nameEl.textContent = product.name || 'Товар';
        if (priceEl) priceEl.textContent = `${Number(product.price || 0).toFixed(2)} ₸`;
        if (stockEl) stockEl.textContent = `На складе: ${product.stock || 0}`;

        // Load image
        if (imgEl) {
            try {
                const imgRes = await authorizedFetch(`${API_PRODUCTS_BASE}/${encodeURIComponent(productId)}/image`);
                if (imgRes.ok) {
                    const blob = await imgRes.blob();
                    imgEl.src = URL.createObjectURL(blob);
                }
            } catch {
                // Use placeholder if image fails
                imgEl.src = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="200" height="200"%3E%3Crect fill="%23ddd" width="200" height="200"/%3E%3C/svg%3E';
            }
        }
    } catch (err) {
        console.error('Error loading product details:', err);
        const nameEl = cardElement.querySelector('.cart-item-name');
        if (nameEl) nameEl.textContent = 'Товар не найден';
    }
}

// Update cart summary
function updateCartSummary() {
    const itemsCountEl = document.getElementById('cartItemsCount');
    const totalEl = document.getElementById('cartTotal');

    if (itemsCountEl) {
        const totalItems = cartItems.reduce((sum, item) => sum + (item.quantity || 1), 0);
        itemsCountEl.textContent = totalItems;
    }

    if (totalEl) {
        if (cartData && cartData.totalPrice) {
            totalEl.textContent = `${Number(cartData.totalPrice).toFixed(2)} ₸`;
        } else {
            totalEl.textContent = '0.00 ₸';
        }
    }
}

// Remove item from cart
async function removeFromCart(cartItemId) {
    if (!cartData || !cartData.id) {
        showToast('Корзина не найдена', 'error');
        return;
    }

    try {
        await apiRemoveItemFromCart(cartData.id, cartItemId);
        await loadCart();
        showToast('Товар удалён из корзины');
    } catch (err) {
        console.error('Error removing from cart:', err);
        showToast(err.message || 'Ошибка удаления товара', 'error');
    }
}

// Initialize cart page
function initCartPage() {
    ensureAuth();
    loadCart();

    // Event handlers
    const container = document.getElementById('cartItemsContainer');
    if (container) {
        // Remove item
        container.addEventListener('click', async (e) => {
            const removeBtn = e.target.closest('.cart-item-remove');
            if (removeBtn) {
                const cartItemId = parseInt(removeBtn.dataset.cartItemId, 10);
                if (confirm('Удалить товар из корзины?')) {
                    await removeFromCart(cartItemId);
                }
            }
        });

        // Quantity controls - for now just remove/add (API doesn't support update)
        container.addEventListener('click', async (e) => {
            const plusBtn = e.target.closest('.quantity-btn.plus');
            const minusBtn = e.target.closest('.quantity-btn.minus');
            
            if (plusBtn) {
                const cartItemId = parseInt(plusBtn.dataset.cartItemId, 10);
                const item = cartItems.find(i => i.id === cartItemId);
                if (item) {
                    // Add one more - reload page to show updated cart
                    showToast('Обновите страницу для изменения количества');
                }
            }
            
            if (minusBtn) {
                const cartItemId = parseInt(minusBtn.dataset.cartItemId, 10);
                const item = cartItems.find(i => i.id === cartItemId);
                if (item && item.quantity > 1) {
                    // Remove one item
                    await removeFromCart(cartItemId);
                } else if (item && item.quantity === 1) {
                    if (confirm('Удалить товар из корзины?')) {
                        await removeFromCart(cartItemId);
                    }
                }
            }
        });
    }

    // Checkout button
    const checkoutBtn = document.getElementById('checkoutBtn');
    if (checkoutBtn) {
        checkoutBtn.addEventListener('click', () => {
            if (cartItems && cartItems.length > 0) {
                // TODO: Navigate to order page
                showToast('Функция оформления заказа будет реализована позже', 'error');
            }
        });
    }
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initCartPage);
} else {
    initCartPage();
}
