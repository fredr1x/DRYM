// Basic configuration
const API_BASE = 'http://localhost:8080/api/v1/users';
const LOCAL_STORAGE_KEY = 'oss_profile_user';
const LS_ACCESS_TOKEN_KEY = 'oss_jwt_access';
const LS_REFRESH_TOKEN_KEY = 'oss_jwt_refresh';
// Fallback demo user id if ничего не сохранено
const DEFAULT_USER_ID = 1;

// Cached user state
let currentUser = null;

// DOM helpers
function $(selector) {
    return document.querySelector(selector);
}

function setText(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
}

// Toast notification (jQuery for small animation)
let toastTimeout;
function showToast(message, type = 'success') {
    const $toast = $('#toast');
    if (!$toast) return;
    $toast.textContent = message;
    $toast.className = 'toast'; // reset
    if (type === 'error') {
        $toast.classList.add('error');
    }
    $toast.classList.add('visible');

    clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => {
        $toast.classList.remove('visible');
    }, 2500);
}

// Modal controls (using jQuery fade for show/hide)
function openModal(modalId) {
    const modal = document.getElementById(modalId);
    const backdrop = document.getElementById('modalBackdrop');
    if (!modal || !backdrop) return;

    // jQuery fadeIn для плавности
    window.jQuery(backdrop)
        .stop(true, true)
        .addClass('visible')
        .fadeIn(180);

    window.jQuery(modal)
        .stop(true, true)
        .addClass('visible')
        .fadeIn(200);
}

function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    const backdrop = document.getElementById('modalBackdrop');
    if (!modal || !backdrop) return;

    window.jQuery(modal)
        .stop(true, true)
        .fadeOut(160, () => {
            modal.classList.remove('visible');

            // Проверяем после того, как текущая модалка спрятана
            const anyOpen = Array.from(document.querySelectorAll('.modal')).some(
                (m) => m.classList.contains('visible')
            );

            if (!anyOpen) {
                window.jQuery(backdrop)
                    .stop(true, true)
                    .fadeOut(180, () => backdrop.classList.remove('visible'));
            }
        });
}

function closeAllModals() {
    document.querySelectorAll('.modal').forEach((modal) => {
        const id = modal.id;
        closeModal(id);
    });
}

// Local storage helpers
function getStoredUser() {
    try {
        const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
        if (!raw) return null;
        return JSON.parse(raw);
    } catch {
        return null;
    }
}

function getAccessToken() {
    try {
        return localStorage.getItem(LS_ACCESS_TOKEN_KEY);
    } catch {
        return null;
    }
}

function getAuthHeaders() {
    const token = getAccessToken();
    const base = { 'Content-Type': 'application/json' };
    if (!token) return base;
    return {
        ...base,
        Authorization: `Bearer ${token}`,
    };
}

function saveUserToStorage(user) {
    try {
        localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(user));
    } catch {
        // ignore quota errors
    }
}

function getUserId() {
    const stored = getStoredUser();
    if (stored && stored.id) return stored.id;
    return DEFAULT_USER_ID;
}

// API helpers
async function apiGetUser(id) {
    const res = await fetch(`${API_BASE}/${encodeURIComponent(id)}`, {
        headers: getAuthHeaders(),
    });
    if (!res.ok) {
        throw new Error('Не удалось загрузить профиль');
    }
    return res.json();
}

async function apiUpdateProfile(payload) {
    const res = await fetch(`${API_BASE}/update`, {
        method: 'PUT',
        headers: getAuthHeaders(),
        body: JSON.stringify(payload),
    });
    if (!res.ok) {
        throw new Error('Ошибка обновления профиля');
    }
    return res.json();
}

async function apiRecharge(payload) {
    const res = await fetch(`${API_BASE}/recharge`, {
        method: 'PATCH',
        headers: getAuthHeaders(),
        body: JSON.stringify(payload),
    });
    if (!res.ok) {
        throw new Error('Ошибка пополнения баланса');
    }
    return res.json();
}

async function apiChangePassword(payload) {
    const res = await fetch(`${API_BASE}/change_password`, {
        method: 'PATCH',
        headers: getAuthHeaders(),
        body: JSON.stringify(payload),
    });
    if (!res.ok) {
        throw new Error('Ошибка смены пароля');
    }
    return res.json();
}

// UI render
function updateAvatarInitials(firstName, lastName) {
    const initials =
        (firstName?.[0] ?? '').toUpperCase() + (lastName?.[0] ?? '').toUpperCase();
    setText('avatarInitials', initials || 'U');
}

function renderUser(user) {
    if (!user) return;
    currentUser = user;
    saveUserToStorage(user);

    setText('firstName', user.firstName || '—');
    setText('lastName', user.lastName || '—');
    setText('email', user.email || '—');

    const balance =
        typeof user.balance === 'number'
            ? user.balance
            : Number(user.balance ?? 0);
    setText('balance', balance.toFixed(2));

    updateAvatarInitials(user.firstName, user.lastName);

    // показать/спрятать кнопку панели модератора
    const moderatorBtn = document.getElementById('moderatorPanelBtn');
    if (moderatorBtn) {
        moderatorBtn.style.display = userHasModeratorRole() ? 'inline-flex' : 'none';
    }
}

function userHasModeratorRole() {
    // 1) пробуем взять роли из сохранённого пользователя
    const stored = getStoredUser();
    if (stored && Array.isArray(stored.roles)) {
        if (stored.roles.includes('ROLE_MODERATOR')) return true;
    }

    // 2) пробуем декодировать JWT и вытащить роли из payload
    const token = getAccessToken();
    if (!token) return false;
    const parts = token.split('.');
    if (parts.length < 2) return false;
    try {
        const payloadJson = atob(parts[1].replace(/-/g, '+').replace(/_/g, '/'));
        const payload = JSON.parse(payloadJson);
        const roles = payload.roles || payload.authorities || payload.role;
        if (Array.isArray(roles)) {
            return roles.includes('ROLE_MODERATOR');
        }
        if (typeof roles === 'string') {
            return roles === 'ROLE_MODERATOR';
        }
    } catch {
        return false;
    }
    return false;
}

async function loadUser() {
    const cached = getStoredUser();
    if (cached) {
        renderUser(cached);
    }

    const id = getUserId();
    try {
        const fromApi = await apiGetUser(id);
        renderUser(fromApi);
    } catch (err) {
        console.error(err);
        if (!cached) {
            showToast('Не удалось загрузить профиль', 'error');
        }
    }
}

// Event bindings
function initNavbar() {
    const navToggle = document.querySelector('.nav-toggle');
    const navLinks = document.querySelector('.nav-links');
    if (!navToggle || !navLinks) return;

    navToggle.addEventListener('click', () => {
        navToggle.classList.toggle('open');
        navLinks.classList.toggle('open');
    });

    navLinks.querySelectorAll('.nav-link').forEach((link) => {
        link.addEventListener('click', () => {
            navToggle.classList.remove('open');
            navLinks.classList.remove('open');
        });
    });
}

function initModals() {
    const updateProfileBtn = document.getElementById('updateProfileBtn');
    const rechargeBtn = document.getElementById('rechargeBtn');
    const changePasswordBtn = document.getElementById('changePasswordBtn');
    const moderatorBtn = document.getElementById('moderatorPanelBtn');

    updateProfileBtn?.addEventListener('click', () => {
        // префилл полей из currentUser
        if (currentUser) {
            const first = document.getElementById('modalFirstName');
            const last = document.getElementById('modalLastName');
            if (first) first.value = currentUser.firstName ?? '';
            if (last) last.value = currentUser.lastName ?? '';
        }
        $('#updateProfileError').textContent = '';
        openModal('updateProfileModal');
    });

    rechargeBtn?.addEventListener('click', () => {
        const amountInput = document.getElementById('rechargeAmount');
        if (amountInput) amountInput.value = '';
        $('#rechargeError').textContent = '';
        openModal('rechargeModal');
    });

    changePasswordBtn?.addEventListener('click', () => {
        document.getElementById('currentPassword').value = '';
        document.getElementById('newPassword').value = '';
        document.getElementById('confirmPassword').value = '';
        $('#changePasswordError').textContent = '';
        openModal('changePasswordModal');
    });

    moderatorBtn?.addEventListener('click', () => {
        window.location.href = 'moderator.html';
    });

    // Close buttons
    document.querySelectorAll('[data-modal-close]').forEach((btn) => {
        btn.addEventListener('click', () => {
            const modal = btn.closest('.modal');
            if (modal?.id) closeModal(modal.id);
        });
    });

    // Click on backdrop closes all modals
    const backdrop = document.getElementById('modalBackdrop');
    if (backdrop) {
        backdrop.addEventListener('click', () => {
            closeAllModals();
        });
    }

    // Esc key closes
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            closeAllModals();
        }
    });
}

function initForms() {
    const updateForm = document.getElementById('updateProfileForm');
    const rechargeForm = document.getElementById('rechargeForm');
    const changePasswordForm = document.getElementById('changePasswordForm');

    updateForm?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const errorEl = document.getElementById('updateProfileError');
        errorEl.textContent = '';

        const firstName = document.getElementById('modalFirstName').value.trim();
        const lastName = document.getElementById('modalLastName').value.trim();
        if (!firstName || !lastName) {
            errorEl.textContent = 'Имя и фамилия обязательны';
            return;
        }

        const id = getUserId();
        const payload = { id, firstName, lastName };

        updateForm.querySelector('button[type="submit"]').disabled = true;
        try {
            const updated = await apiUpdateProfile(payload);
            renderUser(updated);
            closeModal('updateProfileModal');
            showToast('Профиль обновлён');
        } catch (err) {
            console.error(err);
            errorEl.textContent = 'Не удалось обновить профиль';
        } finally {
            updateForm.querySelector('button[type="submit"]').disabled = false;
        }
    });

    rechargeForm?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const errorEl = document.getElementById('rechargeError');
        errorEl.textContent = '';

        const amountValue = document
            .getElementById('rechargeAmount')
            .value.trim();
        const amount = Number(amountValue);

        if (!amountValue || Number.isNaN(amount) || amount <= 0) {
            errorEl.textContent = 'Введите корректную сумму больше нуля';
            return;
        }

        const userId = getUserId();
        const payload = { userId: userId, amount };

        rechargeForm.querySelector('button[type="submit"]').disabled = true;
        try {
            const updated = await apiRecharge(payload);
            renderUser(updated);
            closeModal('rechargeModal');
            showToast('Баланс пополнен');
        } catch (err) {
            console.error(err);
            errorEl.textContent = 'Не удалось пополнить баланс';
        } finally {
            rechargeForm.querySelector('button[type="submit"]').disabled = false;
        }
    });

    changePasswordForm?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const errorEl = document.getElementById('changePasswordError');
        errorEl.textContent = '';

        const currentPassword = document
            .getElementById('currentPassword')
            .value.trim();
        const newPassword = document
            .getElementById('newPassword')
            .value.trim();
        const confirmPassword = document
            .getElementById('confirmPassword')
            .value.trim();

        if (!currentPassword || !newPassword || !confirmPassword) {
            errorEl.textContent = 'Все поля обязательны';
            return;
        }

        if (newPassword.length < 6) {
            errorEl.textContent = 'Новый пароль должен быть не короче 6 символов';
            return;
        }

        if (newPassword !== confirmPassword) {
            errorEl.textContent = 'Пароли не совпадают';
            return;
        }

        const id = getUserId();
        const payload = { id, currentPassword, newPassword };

        changePasswordForm.querySelector('button[type="submit"]').disabled = true;
        try {
            await apiChangePassword(payload);
            closeModal('changePasswordModal');
            showToast('Пароль изменён');
        } catch (err) {
            console.error(err);
            errorEl.textContent = 'Не удалось сменить пароль';
        } finally {
            changePasswordForm.querySelector('button[type="submit"]').disabled =
                false;
        }
    });
}

// Initialize after DOM + jQuery loaded
document.addEventListener('DOMContentLoaded', () => {
    initNavbar();
    initModals();
    initForms();
    loadUser();
});
