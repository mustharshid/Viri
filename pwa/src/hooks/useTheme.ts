import { useState, useEffect } from 'react';

type Theme = 'dark' | 'light';

export function useTheme(): [Theme, () => void] {
  const [theme, setTheme] = useState<Theme>(() => {
    return (localStorage.getItem('viri_theme') as Theme) || 'dark';
  });

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('viri_theme', theme);
  }, [theme]);

  // Apply immediately on mount too (for page reload)
  useEffect(() => {
    const saved = (localStorage.getItem('viri_theme') as Theme) || 'dark';
    document.documentElement.setAttribute('data-theme', saved);
  }, []);

  const toggle = () => setTheme(prev => (prev === 'dark' ? 'light' : 'dark'));

  return [theme, toggle];
}
