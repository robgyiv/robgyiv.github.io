// Function to apply the theme
function applyTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
}

// Function to detect and apply the system's theme
function detectSystemTheme() {
  const isDarkMode = window.matchMedia("(prefers-color-scheme: dark)").matches;
  return isDarkMode ? "dark" : "light";
}

// Function to initialize the theme
function initializeTheme() {
  const userPreference = localStorage.getItem("theme");
  if (userPreference) {
    applyTheme(userPreference);
  } else {
    const systemTheme = detectSystemTheme();
    applyTheme(systemTheme);
  }
}

// Event listener for system theme changes
window
  .matchMedia("(prefers-color-scheme: dark)")
  .addEventListener("change", (e) => {
    const userPreference = localStorage.getItem("theme");
    if (!userPreference) {
      const newTheme = e.matches ? "dark" : "light";
      applyTheme(newTheme);
    }
  });

// Function to toggle the theme manually
function toggleTheme() {
  const currentTheme = document.documentElement.getAttribute("data-theme");
  const newTheme = currentTheme === "dark" ? "light" : "dark";
  applyTheme(newTheme);
  localStorage.setItem("theme", newTheme);
}

// Initialize theme on page load
initializeTheme();

// Example: Add a button for manual toggling
const toggleButton = document.getElementById("theme-toggle");
if (toggleButton) {
  toggleButton.addEventListener("click", toggleTheme);
}
