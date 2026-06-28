(function () {
    const STORAGE_KEY = 'sitright-theme';
    const root = document.documentElement;

    function getInitialTheme() {
        const savedTheme = localStorage.getItem(STORAGE_KEY);
        if (savedTheme === 'dark' || savedTheme === 'light') {
            return savedTheme;
        }

        return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }

    function applyTheme(theme) {
        root.dataset.theme = theme;
        localStorage.setItem(STORAGE_KEY, theme);

        document.querySelectorAll('.theme-toggle').forEach((button) => {
            const isDark = theme === 'dark';
            button.setAttribute('aria-pressed', String(isDark));
            button.querySelector('.theme-toggle-label').textContent = isDark ? 'Light mode' : 'Dark mode';
        });

        window.dispatchEvent(new CustomEvent('sitright-theme-change', { detail: { theme } }));
    }

    applyTheme(getInitialTheme());

    document.addEventListener('DOMContentLoaded', () => {
        applyTheme(root.dataset.theme || getInitialTheme());

        document.querySelectorAll('.theme-toggle').forEach((button) => {
            button.addEventListener('click', () => {
                const nextTheme = root.dataset.theme === 'dark' ? 'light' : 'dark';
                applyTheme(nextTheme);
            });
        });
    });
}());
