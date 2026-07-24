import { useState, useEffect } from 'react';

export type Theme = 'dark' | 'light' | 'corporate' | 'cute';

export function useTheme(): [Theme, () => void] {
  const [theme, setTheme] = useState<Theme>(() => {
    return (localStorage.getItem('viri_theme') as Theme) || 'dark';
  });

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('viri_theme', theme);
  }, [theme]);

  // Sync state if theme is changed in storage or across windows
  useEffect(() => {
    const saved = (localStorage.getItem('viri_theme') as Theme) || 'dark';
    setTheme(saved);
    document.documentElement.setAttribute('data-theme', saved);

    const handleStorage = (e: StorageEvent) => {
      if (e.key === 'viri_theme' && e.newValue) {
        setTheme(e.newValue as Theme);
        document.documentElement.setAttribute('data-theme', e.newValue);
      }
    };
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, []);

  const toggle = () => {
    setTheme(prev => {
      let next: Theme = 'dark';
      if (prev === 'dark') next = 'light';
      else if (prev === 'light') next = 'corporate';
      else if (prev === 'corporate') next = 'cute';
      else next = 'dark';

      document.documentElement.setAttribute('data-theme', next);
      localStorage.setItem('viri_theme', next);
      return next;
    });
  };

  return [theme, toggle];
}
