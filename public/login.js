const AUTH_API_BASE = 'http://localhost:8080/api/v1/auth';
const LS_ACCESS_TOKEN_KEY = 'oss_jwt_access';
const LS_REFRESH_TOKEN_KEY = 'oss_jwt_refresh';
const LS_LAST_LOGIN_EMAIL = 'oss_last_login_email';
const LS_USER_KEY = 'oss_user';

function saveTokens({ accessToken, refreshToken }) {
    if (accessToken) {
        localStorage.setItem(LS_ACCESS_TOKEN_KEY, accessToken);
    }
    if (refreshToken) {
        localStorage.setItem(LS_REFRESH_TOKEN_KEY, refreshToken);
    }
}

function saveUserData(userData) {
    try {
        const user = {
            id: userData.id,
            email: userData.email,
            firstName: userData.firstName,
            lastName: userData.lastName,
            balance: userData.balance,
        };
        localStorage.setItem(LS_USER_KEY, JSON.stringify(user));
    } catch (err) {
        console.error('Ошибка сохранения данных пользователя:', err);
    }
}

function restoreLastEmail() {
    try {
        const email = localStorage.getItem(LS_LAST_LOGIN_EMAIL);
        if (email) {
            const emailInput = document.getElementById('email');
            if (emailInput) emailInput.value = email;
        }
    } catch {
        // ignore
    }
}

async function login(email, password) {
    const res = await fetch(`${AUTH_API_BASE}/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
    });

    if (!res.ok) {
        const text = await res.text();
        throw new Error(text || 'Ошибка входа');
    }

    const data = await res.json();
    // ожидаем поля accessToken / refreshToken; адаптируйте под свой backend
    saveTokens({
        accessToken: data.accessToken || data.token,
        refreshToken: data.refreshToken,
    });

    saveUserData(data);

    return data;
}

document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('loginForm');
    const errorEl = document.getElementById('loginError');
    const emailInput = document.getElementById('email');
    const passwordInput = document.getElementById('password');

    restoreLastEmail();

    form?.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (!emailInput || !passwordInput) return;

        const email = emailInput.value.trim();
        const password = passwordInput.value.trim();
        errorEl.textContent = '';

        if (!email || !password) {
            errorEl.textContent = 'Заполните email и пароль';
            return;
        }

        // Сохраняем email для UX
        try {
            localStorage.setItem(LS_LAST_LOGIN_EMAIL, email);
        } catch {
            // ignore
        }

        const submitBtn = form.querySelector('button[type="submit"]');
        submitBtn.disabled = true;

        try {
            await login(email, password);
            // Перенаправление на главную после успешного входа
            window.location.href = 'home.html';
        } catch (err) {
            console.error(err);
            errorEl.textContent = err.message || 'Неверный email или пароль';
        } finally {
            submitBtn.disabled = false;
        }
    });
});
