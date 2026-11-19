import { useTheme } from './theme';

/** Header button that switches between the light and dark theme; labelled with the action. */
export default function ThemeToggle() {
  const [theme, setTheme] = useTheme();
  const next = theme === 'dark' ? 'light' : 'dark';
  return (
    <button type="button" className="theme-toggle" onClick={() => setTheme(next)}>
      <span className="theme-toggle-icon" aria-hidden="true">
        {next === 'light' ? '☀' : '☾'}
      </span>
      Switch to {next} theme
    </button>
  );
}
