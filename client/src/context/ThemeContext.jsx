import { createContext, useContext, useEffect, useState } from "react";

const ThemeContext = createContext();

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(() => {
    const saved = localStorage.getItem("cipherlink_theme");
    return saved || "dark";
  });

  useEffect(() => {
    localStorage.setItem("cipherlink_theme", theme);
    const root = document.documentElement;
    if (theme === "dark") {
      root.classList.add("dark");
      root.classList.remove("light");
      document.body.className = "bg-dark-bg text-dark-text font-sans antialiased";
    } else {
      root.classList.add("light");
      root.classList.remove("dark");
      document.body.className = "bg-light-bg text-light-text font-sans antialiased";
    }
  }, [theme]);

  const toggle = () => setTheme((t) => (t === "dark" ? "light" : "dark"));

  return (
    <ThemeContext.Provider value={{ theme, toggle }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
