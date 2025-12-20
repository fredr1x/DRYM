const API_ORDERS_BASE = 'http://localhost:8080/api/v1/orders';

const LS_ACCESS_TOKEN_KEY = 'oss_jwt_access';
const LS_USER_KEY = 'oss_user';

function getToken() {
    try {
        return localStorage.getItem(LS_ACCESS_TOKEN_KEY);
    } catch {
        return null;
    }
}

function getUserData() {
    try {
        const raw = localStorage.getItem(LS_USER_KEY);
        return raw ? JSON.parse(raw) : null;
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
        } catch {}
        window.location.href = 'login.html';
        throw new Error('Не авторизован');
    }
    return res;
}

// Toast уведомления
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

const ORDER_STATUS_LABELS = {
    PENDING: 'Ожидает оплаты',
    PAID: 'Оплачен',
    PROCESSING: 'В обработке',
    SHIPPED: 'Отправлен',
    DELIVERED: 'Доставлен',
    CANCELLED: 'Отменён',
};

const ORDER_STATUS_COLORS = {
    PENDING: '#f59e0b',
    PAID: '#10b981',
    PROCESSING: '#3b82f6',
    SHIPPED: '#8b5cf6',
    DELIVERED: '#22c55e',
    CANCELLED: '#ef4444',
};

// API методы
async function getUserOrders(userId) {
    const res = await authorizedFetch(`${API_ORDERS_BASE}/user/${userId}`);
    if (!res.ok) {
        throw new Error('Не удалось загрузить заказы');
    }
    return res.json();
}

async function payOrder(orderId, userId) {
    const res = await authorizedFetch(`${API_ORDERS_BASE}/${orderId}/pay`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId }),
    });
    if (!res.ok) {
        throw new Error('Не удалось оплатить заказ');
    }
    return res.json();
}

async function cancelOrder(orderId, userId) {
    const res = await authorizedFetch(`${API_ORDERS_BASE}/${orderId}/cancel_order`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId }),
    });
    if (!res.ok) {
        throw new Error('Не удалось отменить заказ');
    }
    return res.json();
}

// UI функции
function createOrderSkeleton() {
    const sk = document.createElement('div');
    sk.className = 'order-card skeleton-card';
    const inner = document.createElement('div');
    inner.className = 'skeleton-inner';
    sk.appendChild(inner);
    return sk;
}

function renderOrdersSkeletons() {
    const container = document.getElementById('ordersContainer');
    if (!container) return;
    container.innerHTML = '';
    for (let i = 0; i < 3; i += 1) {
        container.appendChild(createOrderSkeleton());
    }
}

function calculateOrderTotal(products) {
    if (!products || !Array.isArray(products)) return 0;
    return products.reduce((sum, item) => {
        return sum + (item.productPrice * item.quantity);
    }, 0);
}

async function handlePayOrder(orderId, userId) {
    try {
        const updatedOrder = await payOrder(orderId, userId);
        showToast('Заказ успешно оплачен!');
        await loadOrders();
    } catch (err) {
        console.error(err);
        showToast('Ошибка при оплате заказа', 'error');
    }
}

async function handleCancelOrder(orderId, userId) {
    if (!confirm('Вы уверены, что хотите отменить этот заказ?')) {
        return;
    }

    try {
        await cancelOrder(orderId, userId);
        showToast('Заказ успешно отменён');
        await loadOrders();
    } catch (err) {
        console.error(err);
        showToast('Ошибка при отмене заказа', 'error');
    }
}

function renderOrders(orders) {
    const container = document.getElementById('ordersContainer');
    const emptyState = document.getElementById('ordersEmpty');

    if (!container) return;

    container.innerHTML = '';

    if (!orders || orders.length === 0) {
        container.style.display = 'none';
        if (emptyState) emptyState.style.display = 'block';
        return;
    }

    container.style.display = 'flex';
    if (emptyState) emptyState.style.display = 'none';

    const user = getUserData();
    const userId = user?.id || 0;

    orders.forEach(order => {
        const card = document.createElement('article');
        card.className = 'order-card';

        const header = document.createElement('div');
        header.className = 'order-header';

        const orderId = document.createElement('div');
        orderId.className = 'order-id';
        orderId.textContent = `Заказ #${order.id}`;

        const status = document.createElement('span');
        status.className = 'order-status';
        status.textContent = ORDER_STATUS_LABELS[order.orderStatus] || order.orderStatus;
        status.style.background = ORDER_STATUS_COLORS[order.orderStatus] || '#6b7280';

        header.append(orderId, status);

        const body = document.createElement('div');
        body.className = 'order-body';

        const productsContainer = document.createElement('div');
        productsContainer.className = 'order-products';

        if (order.products && order.products.length > 0) {
            order.products.forEach(product => {
                const item = document.createElement('div');
                item.className = 'order-product-item';

                const info = document.createElement('div');
                info.className = 'order-product-info';

                const productName = document.createElement('div');
                productName.className = 'order-product-name';
                productName.textContent = product.productName || `Товар #${product.productId}`;

                const qty = document.createElement('div');
                qty.className = 'order-product-qty';
                qty.textContent = `Количество: ${product.quantity} шт.`;

                info.append(productName, qty);

                const price = document.createElement('div');
                price.className = 'order-product-price';
                price.textContent = `${(product.productPrice * product.quantity).toFixed(2)} ₸`;

                item.append(info, price);
                productsContainer.appendChild(item);
            });
        }

        body.appendChild(productsContainer);

        const footer = document.createElement('div');
        footer.className = 'order-footer';

        const total = document.createElement('div');
        total.className = 'order-total';
        const totalAmount = calculateOrderTotal(order.products);
        total.innerHTML = `<span class="order-total-label">Итого:</span>${totalAmount.toFixed(2)} ₸`;

        const actions = document.createElement('div');
        actions.className = 'order-actions';

        if (order.orderStatus === 'PENDING') {
            const payBtn = document.createElement('button');
            payBtn.className = 'order-btn pay';
            payBtn.textContent = 'Оплатить';
            payBtn.addEventListener('click', () => handlePayOrder(order.id, userId));
            actions.appendChild(payBtn);
        }

        if (order.orderStatus === 'PENDING' || order.orderStatus === 'PAID') {
            const cancelBtn = document.createElement('button');
            cancelBtn.className = 'order-btn cancel';
            cancelBtn.textContent = 'Отменить';
            cancelBtn.addEventListener('click', () => handleCancelOrder(order.id, userId));
            actions.appendChild(cancelBtn);
        }

        footer.append(total, actions);

        card.append(header, body, footer);
        container.appendChild(card);
    });
}

async function loadOrders() {
    const user = getUserData();

    if (!user || !user.id) {
        showToast('Не удалось определить пользователя', 'error');
        return;
    }

    try {
        renderOrdersSkeletons();
        const orders = await getUserOrders(user.id);
        renderOrders(orders);
    } catch (err) {
        console.error(err);
        showToast('Ошибка загрузки заказов', 'error');
        const container = document.getElementById('ordersContainer');
        const emptyState = document.getElementById('ordersEmpty');
        if (container) container.style.display = 'none';
        if (emptyState) emptyState.style.display = 'block';
    }
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

async function initPage() {
    ensureAuth();
    initHeaderScrollShadow();
    await loadOrders();
}

document.addEventListener('DOMContentLoaded', () => {
    initPage().catch((err) => {
        console.error(err);
        showToast('Ошибка инициализации страницы', 'error');
    });
});
