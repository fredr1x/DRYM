const AUTH_API_BASE = 'http://localhost:8080/api/v1/auth';
const LS_LAST_REGISTER_EMAIL = 'oss_last_register_email';

async function registerUser({ firstName, lastName, email, password, balance }) {
    const res = await fetch(`${AUTH_API_BASE}/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            firstName,
            lastName,
            email,
            password,
            balance,
        }),
    });

    if (!res.ok) {
        const text = await res.text();
        throw new Error(text || 'Ошибка регистрации');
    }

    return res.json();
}

function restoreRegisterEmail() {
    try {
        const email = localStorage.getItem(LS_LAST_REGISTER_EMAIL);
        if (email) {
            const emailInput = document.getElementById('email');
            if (emailInput) emailInput.value = email;
        }
    } catch {
        // ignore
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('registerForm');
    const errorEl = document.getElementById('registerError');
    const firstInput = document.getElementById('firstname');
    const lastInput = document.getElementById('lastname');
    const emailInput = document.getElementById('email');
    const passwordInput = document.getElementById('password');

    restoreRegisterEmail();

    form?.addEventListener('submit', async (e) => {
        e.preventDefault();
        errorEl.textContent = '';

        const firstName = firstInput.value.trim();
        const lastName = lastInput.value.trim();
        const email = emailInput.value.trim();
        const password = passwordInput.value.trim();
        const balance = 0.0;

        if (!firstName || !lastName || !email || !password) {
            errorEl.textContent = 'Все поля обязательны';
            return;
        }

        if (password.length < 6) {
            errorEl.textContent = 'Пароль должен быть не короче 6 символов';
            return;
        }

        try {
            localStorage.setItem(LS_LAST_REGISTER_EMAIL, email);
        } catch {
            // ignore
        }

        const submitBtn = form.querySelector('button[type="submit"]');
        submitBtn.disabled = true;

        try {
            await registerUser({ firstName, lastName, email, password, balance });
            window.location.href = 'login.html';
        } catch (err) {
            console.error(err);
            errorEl.textContent = err.message || 'Ошибка регистрации';
        } finally {
            submitBtn.disabled = false;
        }
    });
});
