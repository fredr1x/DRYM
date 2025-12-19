// Cart functionality
const API_CART_BASE = 'http://localhost:8080/api/v1/carts';
const LS_ACCESS_TOKEN_KEY = 'oss_jwt_access';
const LS_PROFILE_KEY = 'oss_profile_user';
const LS_CART_KEY = 'oss_cart_data';
const DEFAULT_USER_ID = 1;

// Cart state
let cartData = null;
let cartItems = [];
let cartTotalItems = 0;

// DOM helpers
function $(selector) {
    return document.querySelector(selector);
}

function $$(selector) {
    return document.querySelectorAll(selector);
}

// Get user ID from localStorage (same pattern as profile.js)
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

// Authorized fetch (same pattern as home.js)
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
    const toast = $('#toast');
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

// LocalStorage helpers
function saveCartToStorage(data) {
    try {
        localStorage.setItem(LS_CART_KEY, JSON.stringify(data));
    } catch {
        // ignore quota errors
    }
}

function getCartFromStorage() {
    try {
        const raw = localStorage.getItem(LS_CART_KEY);
        if (!raw) return null;
        return JSON.parse(raw);
    } catch {
        return null;
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

async function apiGetCartTotalItems(cartId) {
    const res = await authorizedFetch(`${API_CART_BASE}/${encodeURIComponent(cartId)}/total_cart_items`);
    if (!res.ok) {
        throw new Error('Не удалось получить количество товаров');
    }
    const text = await res.text();
    return parseInt(text, 10) || 0;
}

async function apiAddItemToCart(itemData) {
    const res = await authorizedFetch(`${API_CART_BASE}/add_item`, {
        method: 'POST',
        body: JSON.stringify(itemData),
    });
    if (!res.ok) {
        throw new Error('Не удалось добавить товар в корзину');
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
        cartData = null;
        cartItems = [];
        cartTotalItems = 0;
        updateCartUI();
        return;
    }

    try {
        // Try to load from cache first for instant UI update
        const cached = getCartFromStorage();
        if (cached) {
            cartData = cached.cartData;
            cartItems = cached.cartItems || [];
            cartTotalItems = cached.cartTotalItems || 0;
            updateCartUI();
        }

        // Load from server
        try {
            cartData = await apiGetCart(userId);
            cartItems = await apiGetCartItems(userId);
            
            if (cartData && cartData.id) {
                cartTotalItems = await apiGetCartTotalItems(cartData.id);
            } else {
                cartTotalItems = cartItems.length;
            }

            // Save to cache
            saveCartToStorage({
                cartData,
                cartItems,
                cartTotalItems,
            });

            updateCartUI();
        } catch (apiErr) {
            // If API fails but we have cache, keep using cache
            if (!cached) {
                throw apiErr;
            }
            console.warn('Failed to load cart from API, using cache:', apiErr);
        }
    } catch (err) {
        console.error('Error loading cart:', err);
        // Reset to empty if no cache
        if (!getCartFromStorage()) {
            cartData = null;
            cartItems = [];
            cartTotalItems = 0;
            updateCartUI();
        }
    }
}

// Add item to cart
async function addToCart(productId, quantity = 1) {
    const userId = getUserId();
    if (!userId) {
        showToast('Необходимо войти в систему', 'error');
        return;
    }

    try {
        // Get or create cart
        if (!cartData || !cartData.id) {
            try {
                cartData = await apiGetCart(userId);
            } catch (err) {
                // Cart might not exist yet, backend will create it
                cartData = { id: 0 };
            }
        }

        const cartId = cartData.id || 0;

        const itemData = {
            id: 0, // Will be set by backend
            quantity: quantity,
            user_id: userId,
            cart_id: cartId,
            product_id: productId,
        };

        await apiAddItemToCart(itemData);

        // Reload cart
        await loadCart();
        showToast('Товар добавлен в корзину');
    } catch (err) {
        console.error('Error adding to cart:', err);
        showToast(err.message || 'Ошибка добавления товара', 'error');
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

// Update cart UI
function updateCartUI() {
    updateCartCounter();
    const modal = $('#cartModal');
    if (modal && modal.classList.contains('visible')) {
        renderCartItems();
        updateCartTotal();
    }
    updateCheckoutButton();
}

// Update cart counter in header
function updateCartCounter() {
    const counter = $('#cartCounter');
    if (counter) {
        if (cartTotalItems > 0) {
            counter.textContent = cartTotalItems;
            counter.style.display = 'flex';
        } else {
            counter.style.display = 'none';
        }
    }
}

// Render cart items in modal
function renderCartItems() {
    const container = $('#cartItemsContainer');
    const emptyState = $('#cartEmptyState');
    if (!container || !emptyState) return;

    container.innerHTML = '';

    if (!cartItems || cartItems.length === 0) {
        emptyState.style.display = 'block';
        updateCheckoutButton();
        return;
    }

    emptyState.style.display = 'none';

    cartItems.forEach((item) => {
        const card = createCartItemCard(item);
        container.appendChild(card);
    });
    
    updateCheckoutButton();
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
        const API_PRODUCTS_BASE = 'http://localhost:8081/api/v1/products';
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

// Update cart total
function updateCartTotal() {
    const totalEl = $('#cartTotal');
    if (!totalEl) return;

    if (!cartData || !cartData.totalPrice) {
        totalEl.textContent = '0.00 ₸';
        return;
    }

    totalEl.textContent = `${Number(cartData.totalPrice).toFixed(2)} ₸`;
}

// Update checkout button state
function updateCheckoutButton() {
    const checkoutBtn = $('#cartCheckoutBtn');
    if (!checkoutBtn) return;

    if (cartItems && cartItems.length > 0) {
        checkoutBtn.disabled = false;
    } else {
        checkoutBtn.disabled = true;
    }
}

// Modal controls (using jQuery like profile.js)
function openCartModal() {
    const modal = $('#cartModal');
    const backdrop = $('#cartModalBackdrop');
    if (!modal || !backdrop) return;

    if (window.jQuery) {
        window.jQuery(backdrop)
            .stop(true, true)
            .addClass('visible')
            .fadeIn(180);

        window.jQuery(modal)
            .stop(true, true)
            .addClass('visible')
            .fadeIn(200);
    } else {
        backdrop.classList.add('visible');
        modal.classList.add('visible');
    }

    // Always refresh cart when opening modal
    loadCart().then(() => {
        renderCartItems();
        updateCartTotal();
        updateCheckoutButton();
    });
}

function closeCartModal() {
    const modal = $('#cartModal');
    const backdrop = $('#cartModalBackdrop');
    if (!modal || !backdrop) return;

    if (window.jQuery) {
        window.jQuery(modal)
            .stop(true, true)
            .fadeOut(160, () => {
                modal.classList.remove('visible');
                window.jQuery(backdrop)
                    .stop(true, true)
                    .fadeOut(180, () => backdrop.classList.remove('visible'));
            });
    } else {
        modal.classList.remove('visible');
        backdrop.classList.remove('visible');
    }
}

// Initialize cart functionality
function initCart() {
    // Load cart on page load
    loadCart();

    // Cart button click handler
    const cartBtn = $('#cartNavBtn');
    if (cartBtn && window.jQuery) {
        window.jQuery(cartBtn).on('click', (e) => {
            e.preventDefault();
            openCartModal();
        });
    }

    // Close button handlers
    const closeBtn = $('#cartModalClose');
    const backdrop = $('#cartModalBackdrop');
    
    if (closeBtn && window.jQuery) {
        window.jQuery(closeBtn).on('click', closeCartModal);
    }

    if (backdrop && window.jQuery) {
        window.jQuery(backdrop).on('click', (e) => {
            if (e.target === backdrop) {
                closeCartModal();
            }
        });
    }

    // ESC key handler
    if (window.jQuery) {
        window.jQuery(document).on('keydown', (e) => {
            if (e.key === 'Escape') {
                const modal = $('#cartModal');
                if (modal && modal.classList.contains('visible')) {
                    closeCartModal();
                }
            }
        });
    }

    // Delegate event handlers for cart items (using jQuery)
    if (window.jQuery) {
        const container = $('#cartItemsContainer');
        if (container) {
            // Remove item
            window.jQuery(container).on('click', '.cart-item-remove', async function() {
                const cartItemId = parseInt(window.jQuery(this).data('cart-item-id'), 10);
                if (confirm('Удалить товар из корзины?')) {
                    await removeFromCart(cartItemId);
                }
            });

            // Increase quantity - add new item with same product
            window.jQuery(container).on('click', '.quantity-btn.plus', async function() {
                const cartItemId = parseInt(window.jQuery(this).data('cart-item-id'), 10);
                const item = cartItems.find(i => i.id === cartItemId);
                if (item) {
                    // Add one more of the same product
                    await addToCart(item.product_id, 1);
                }
            });

            // Decrease quantity - remove one item
            window.jQuery(container).on('click', '.quantity-btn.minus', async function() {
                const cartItemId = parseInt(window.jQuery(this).data('cart-item-id'), 10);
                const item = cartItems.find(i => i.id === cartItemId);
                if (item && item.quantity > 1) {
                    // Remove one item
                    await removeFromCart(cartItemId);
                } else if (item && item.quantity === 1) {
                    if (confirm('Удалить товар из корзины?')) {
                        await removeFromCart(cartItemId);
                    }
                }
            });
        }

        // Checkout button handler
        const checkoutBtn = $('#cartCheckoutBtn');
        if (checkoutBtn) {
            window.jQuery(checkoutBtn).on('click', () => {
                if (cartItems && cartItems.length > 0) {
                    showToast('Функция оформления заказа будет реализована позже', 'error');
                    // TODO: Implement checkout functionality
                }
            });
        }
    }
}

// Export for use in other files
if (typeof window !== 'undefined') {
    window.cartModule = {
        addToCart,
        loadCart,
        openCartModal,
        updateCartCounter,
    };
}

// Auto-initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initCart);
} else {
    initCart();
}

