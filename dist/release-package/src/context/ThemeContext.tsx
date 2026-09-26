import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

export type AppTheme = 'default' | 'hai-ba-trung';

interface ThemeContextType {
  theme: AppTheme;
  setTheme: (theme: AppTheme) => void;
  toggleTheme: () => void;
  isHaiBaTrung: boolean;
}

const THEME_STORAGE_KEY = 'jami:theme';

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [theme, setThemeState] = useState<AppTheme>(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem(THEME_STORAGE_KEY);
        if (saved === 'hai-ba-trung' || saved === 'default') {
          return saved;
        }
      } catch {}
    }
    return 'default';
  });

  const applyThemeToDOM = useCallback((newTheme: AppTheme) => {
    if (typeof document !== 'undefined') {
      document.documentElement.setAttribute('data-theme', newTheme);
      if (document.body) {
        document.body.setAttribute('data-theme', newTheme);
      }
    }
  }, []);

  useEffect(() => {
    applyThemeToDOM(theme);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {}
  }, [theme, applyThemeToDOM]);

  const setTheme = useCallback((newTheme: AppTheme) => {
    setThemeState(newTheme);
  }, []);

  const toggleTheme = useCallback(() => {
    setThemeState((prev) => (prev === 'default' ? 'hai-ba-trung' : 'default'));
  }, []);

  return (
    <ThemeContext.Provider
      value={{
        theme,
        setTheme,
        toggleTheme,
        isHaiBaTrung: theme === 'hai-ba-trung',
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = (): ThemeContextType => {
  const context = useContext(ThemeContext);
  if (!context) {
    return {
      theme: 'default',
      setTheme: () => {},
      toggleTheme: () => {},
      isHaiBaTrung: false,
    };
  }
  return context;
};
