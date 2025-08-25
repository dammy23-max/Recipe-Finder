/** =============== AUTH =============== **/
const signupSection = document.getElementById("signupSection");
const loginSection = document.getElementById("loginSection");
const appSection = document.getElementById("appSection");

const showLogin = document.getElementById("showLogin");
const showSignup = document.getElementById("showSignup");
const signupBtn = document.getElementById("signupBtn");
const loginBtn = document.getElementById("loginBtn");
const logoutBtn = document.getElementById("logoutBtn");

// Declare variables that will be initialized later
let viewingFavorites = false;
let toggleFavoritesBtn, searchInput, searchBtn, mealTypeFilter;
let recipesContainer, modal, modalContent, closeModal, searchSection;

function showSection(section) {
  signupSection.classList.add("hidden");
  loginSection.classList.add("hidden");
  appSection.classList.add("hidden");
  section.classList.remove("hidden");
}

// simple localStorage auth
function isLoggedIn() {
  return !!localStorage.getItem("currentUser");
}

function guard() {
  if (isLoggedIn()) {
    showSection(appSection);
    // Initialize app variables before using them
    initAppVariables();
    // show suggested meals immediately (not blank)
    initialPopulate();
  } else {
    showSection(signupSection);
  }
}

// Initialize app variables
function initAppVariables() {
  toggleFavoritesBtn = document.getElementById("toggleFavoritesBtn");
  searchInput = document.getElementById("searchInput");
  searchBtn = document.getElementById("searchBtn");
  mealTypeFilter = document.getElementById("mealTypeFilter");
  recipesContainer = document.getElementById("recipesContainer");
  modal = document.getElementById("modal");
  modalContent = document.getElementById("modalContent");
  closeModal = document.getElementById("closeModal");
  searchSection = document.getElementById("searchSection");
  
  // Set up event listeners for app functionality
  setupAppEventListeners();
}

function setupAppEventListeners() {
  searchBtn.addEventListener("click", handleSearch);
  mealTypeFilter.addEventListener("change", handleMealTypeFilter);
  toggleFavoritesBtn.addEventListener("click", handleToggleFavorites);
  
  // Close modal behavior
  closeModal.addEventListener("click", () => {
    modal.classList.add("hidden");
    modal.classList.remove("flex");
  });
  
  modal.addEventListener("click", e => {
    if (e.target === modal) {
      modal.classList.add("hidden");
      modal.classList.remove("flex");
    }
  });
}

showLogin.addEventListener("click", (e) => { e.preventDefault(); showSection(loginSection); });
showSignup.addEventListener("click", (e) => { e.preventDefault(); showSection(signupSection); });

signupBtn.addEventListener("click", () => {
  const username = document.getElementById("signupUsername").value.trim();
  const password = document.getElementById("signupPassword").value.trim();
  if (!username || !password) return alert("Please fill all fields");

  const users = JSON.parse(localStorage.getItem("users") || "{}");
  if (users[username]) return alert("User already exists");
  users[username] = password;
  localStorage.setItem("users", JSON.stringify(users));

  alert("Signup successful! Please login.");
  showSection(loginSection);
});

loginBtn.addEventListener("click", () => {
  const username = document.getElementById("loginUsername").value.trim();
  const password = document.getElementById("loginPassword").value.trim();
  const users = JSON.parse(localStorage.getItem("users") || "{}");
  if (!users[username] || users[username] !== password) {
    return alert("Invalid credentials");
  }
  localStorage.setItem("currentUser", username);
  showSection(appSection);
  initAppVariables();
  initialPopulate(); // meals on entry
});

logoutBtn.addEventListener("click", () => {
  localStorage.removeItem("currentUser");
  showSection(loginSection);
});

guard();

/** =============== API HELPERS (MealDB + Nigerian) =============== **/
// Base MealDB search
async function searchMealDBByName(query) {
  try {
    const res = await fetch(`https://www.themealdb.com/api/json/v1/1/search.php?s=${encodeURIComponent(query)}`);
    const data = await res.json();
    return data.meals || [];
  } catch (error) {
    console.error("Error searching MealDB:", error);
    return [];
  }
}

// Nigerian list (area) then filter by name (client-side)
async function searchNigerianByName(query) {
  try {
    const res = await fetch(`https://www.themealdb.com/api/json/v1/1/filter.php?a=Nigerian`);
    const data = await res.json();
    let meals = data.meals || [];
    if (query) {
      const q = query.toLowerCase();
      meals = meals.filter(m => (m.strMeal || "").toLowerCase().includes(q));
    }
    return meals;
  } catch (error) {
    console.error("Error searching Nigerian meals:", error);
    return [];
  }
}

// Lookup details by id (for modal and for filling Nigerian list items)
async function lookupMealById(id) {  // Renamed from lookupById to avoid conflict
  try {
    const res = await fetch(`https://www.themealdb.com/api/json/v1/1/lookup.php?i=${id}`);
    const data = await res.json();
    return (data.meals && data.meals[0]) ? data.meals[0] : null;
  } catch (error) {
    console.error("Error looking up meal by ID:", error);
    return null;
  }
}

// Suggestions when empty (mix general + Nigerian)
async function initialPopulate() {
  viewingFavorites = false;
  if (toggleFavoritesBtn) {
    toggleFavoritesBtn.classList.remove("bg-green-600");
    toggleFavoritesBtn.classList.add("bg-red-500");
  }
  if (searchSection) {
    searchSection.style.display = "flex";
  }

  // Show a friendly loading state
  if (recipesContainer) {
    recipesContainer.innerHTML = `<p class="col-span-full text-center text-gray-600">Loading meals...</p>`;
  }

  try {
    const [general, naija] = await Promise.all([
      searchMealDBByName(""),          // many meals
      searchNigerianByName("")         // Nigerian list
    ]);

    // take some from each to avoid blank page
    const picks = [...(general || []).slice(0, 9), ...(naija || []).slice(0, 6)];
    displayRecipes(picks);
  } catch (error) {
    console.error("Error loading initial meals:", error);
    if (recipesContainer) {
      recipesContainer.innerHTML = `<p class="col-span-full text-center text-red-500">Failed to load meals. Please try again.</p>`;
    }
  }
}

/** =============== RECIPE FUNCTIONS =============== **/
// Fetch recipes by search — combine both APIs
async function fetchRecipes(query) {
  try {
    const [fromMealDB, fromNaija] = await Promise.all([
      searchMealDBByName(query),
      searchNigerianByName(query)
    ]);

    // Deduplicate by idMeal
    const map = new Map();
    [...(fromMealDB || []), ...(fromNaija || [])].forEach(m => { if (m && m.idMeal) map.set(m.idMeal, m); });
    const all = Array.from(map.values());

    if (all.length === 0) {
      // If none found: show suggestions
      if (recipesContainer) {
        recipesContainer.innerHTML = `<p class="col-span-full text-center text-red-500 font-semibold">No meals found. Here are some suggestions:</p>`;
      }
      await initialPopulate();
      return;
    }
    displayRecipes(all);
  } catch (error) {
    console.error("Error fetching recipes:", error);
    if (recipesContainer) {
      recipesContainer.innerHTML = `<p class="col-span-full text-center text-red-500">Failed to search recipes. Please try again.</p>`;
    }
  }
}

// Fetch by meal type (keep your original mapping)
async function fetchByMealType(type) {
  let urls = [];
  if (type === "Breakfast") {
    urls = ["https://www.themealdb.com/api/json/v1/1/filter.php?c=Breakfast"];
  } else if (type === "Lunch") {
    urls = [
      "https://www.themealdb.com/api/json/v1/1/filter.php?c=Chicken",
      "https://www.themealdb.com/api/json/v1/1/filter.php?c=Beef",
      "https://www.themealdb.com/api/json/v1/1/filter.php?c=Pasta"
    ];
  } else if (type === "Dinner") {
    urls = [
      "https://www.themealdb.com/api/json/v1/1/filter.php?c=Seafood",
      "https://www.themealdb.com/api/json/v1/1/filter.php?c=Lamb",
      "https://www.themealdb.com/api/json/v1/1/filter.php?c=Miscellaneous"
    ];
  }

  try {
    let allMeals = [];
    for (const url of urls) {
      const res = await fetch(url);
      const data = await res.json();
      if (data.meals) allMeals = allMeals.concat(data.meals);
    }

    // Also mix in some Nigerian meals for each filter view
    const naija = await searchNigerianByName("");
    displayRecipes([...(allMeals || []), ...(naija || []).slice(0, 6)]);
  } catch (error) {
    console.error("Error fetching by meal type:", error);
    if (recipesContainer) {
      recipesContainer.innerHTML = `<p class="col-span-full text-center text-red-500">Failed to filter meals. Please try again.</p>`;
    }
  }
}

// Display recipe cards (preserving your structure + emojis)
function displayRecipes(meals) {
  if (!recipesContainer) return;
  
  recipesContainer.innerHTML = "";

  if (!meals || !meals.length) {
    recipesContainer.innerHTML = `<p class="col-span-full text-center text-red-500 font-semibold">No meals found.</p>`;
    return;
  }

  meals.forEach(meal => {
    if (!meal || !meal.idMeal) return; // Skip invalid meals
    
    const card = document.createElement("div");
    card.className = "bg-white shadow-md rounded overflow-hidden flex flex-col";
    card.setAttribute("data-card-id", meal.idMeal); // so removeFromFavorites can remove DOM card

    card.innerHTML = `
      <img src="${meal.strMealThumb || ''}" alt="${meal.strMeal || 'Meal'}" class="h-48 w-full object-cover" />
      <div class="p-4 flex-1 flex flex-col justify-between">
        <h2 class="text-lg font-semibold mb-2">${meal.strMeal || 'Unnamed Meal'}</h2>
        <div class="flex gap-2">
          <button data-id="${meal.idMeal}" class="details-btn bg-blue-500 text-white px-3 py-1 rounded hover:bg-blue-600 transition flex-1">👁 Details</button>
          ${
            viewingFavorites
              ? `<button data-id="${meal.idMeal}" class="remove-fav-btn bg-gray-600 text-white px-3 py-1 rounded hover:bg-gray-700 transition flex-1">❌ Remove</button>`
              : `<button data-id="${meal.idMeal}" class="favorite-btn bg-red-500 text-white px-3 py-1 rounded hover:bg-red-600 transition flex-1">⭐ Favorite</button>`
          }
        </div>
      </div>
    `;

    recipesContainer.appendChild(card);
  });

  // Attach event listeners to new buttons
  document.querySelectorAll(".details-btn").forEach(btn => {
    btn.addEventListener("click", () => showDetailsById(btn.getAttribute("data-id")));
  });

  if (viewingFavorites) {
    document.querySelectorAll(".remove-fav-btn").forEach(btn => {
      btn.addEventListener("click", () => removeFromFavorites(btn.getAttribute("data-id")));
    });
  } else {
    document.querySelectorAll(".favorite-btn").forEach(btn => {
      btn.addEventListener("click", () => addToFavorites(btn.getAttribute("data-id")));
    });
  }
}

/** =============== DETAILS (fetch by id, then render modal) =============== **/
async function showDetailsById(id) {
  console.log("Fetching details for meal ID:", id);
  try {
    const meal = await lookupMealById(id); // Use the renamed function
    if (!meal) {
      console.error("No meal data returned for ID:", id);
      return alert("Unable to load details.");
    }

    console.log("Meal data received:", meal);
    showMealDetails(meal);
  } catch (error) {
    console.error("Error loading meal details:", error);
    alert("Failed to load meal details. Please try again.");
  }
}

// Build modal content from full meal object (your original approach)
function showMealDetails(mealData) { // Renamed parameter to avoid conflict
  console.log("Displaying meal details for:", mealData.strMeal);
  
  let ingredients = "";
  for (let i = 1; i <= 20; i++) {
    const ingredient = mealData[`strIngredient${i}`];
    const measure = mealData[`strMeasure${i}`];
    if (ingredient && ingredient.trim() !== "") {
      ingredients += `<li>${ingredient} - ${measure || ""}</li>`;
    }
  }

  if (modalContent) {
    modalContent.innerHTML = `
      <h2 class="text-2xl font-bold mb-4">${mealData.strMeal || "Unnamed Meal"}</h2>
      <img src="${mealData.strMealThumb || ''}" class="w-full h-64 object-cover rounded mb-4"/>
      <p class="mb-2"><strong>Category:</strong> ${mealData.strCategory || "-"}</p>
      <p class="mb-2"><strong>Area:</strong> ${mealData.strArea || "-"}</p>
      <h3 class="text-lg font-semibold mt-4 mb-2">Ingredients:</h3>
      <ul class="list-disc list-inside mb-4">${ingredients || "No ingredients listed"}</ul>
      <h3 class="text-lg font-semibold mb-2">Instructions:</h3>
      <p class="text-sm leading-relaxed whitespace-pre-wrap">${mealData.strInstructions || "No instructions available."}</p>
    `;
  }

  if (modal) {
    modal.classList.remove("hidden");
    modal.classList.add("flex");
    console.log("Modal should now be visible");
  }
}

/** =============== FAVORITES =============== **/
function getFavorites() {
  return JSON.parse(localStorage.getItem("favorites")) || [];
}

function setFavorites(arr) {
  localStorage.setItem("favorites", JSON.stringify(arr));
}

// Add recipe to favorites
function addToFavorites(id) {
  const favorites = getFavorites();
  if (!favorites.includes(id)) {
    favorites.push(id);
    setFavorites(favorites);
    alert("Added to favorites!");
  } else {
    alert("Already in favorites!");
  }
}

// Remove from favorites (fixed query selector)
function removeFromFavorites(id) {
  const target = String(id).trim();
  const key = "favorites";

  const current = JSON.parse(localStorage.getItem(key)) || [];
  const next = current.filter(x => String(x).trim() !== target);
  localStorage.setItem(key, JSON.stringify(next));

  // Remove the card from the DOM if it's on the page
  const card = document.querySelector(`[data-card-id="${target}"]`);
  if (card) card.remove();

  // Refresh favorites view
  if (viewingFavorites) {
    loadFavorites();
  }
}

// Load favorites view (cards show ❌ Remove)
async function loadFavorites() {
  viewingFavorites = true;
  if (toggleFavoritesBtn) {
    toggleFavoritesBtn.classList.add("bg-green-600");
    toggleFavoritesBtn.classList.remove("bg-red-500");
  }
  if (searchSection) {
    searchSection.style.display = "none";
  }

  const favorites = getFavorites();
  if (favorites.length === 0) {
    if (recipesContainer) {
      recipesContainer.innerHTML = `<p class="col-span-full text-center text-gray-600 font-semibold">No favorites saved yet.</p>`;
    }
    return;
  }

  try {
    let meals = [];
    for (const id of favorites) {
      const meal = await lookupMealById(id); // Use the renamed function
      if (meal) meals.push(meal);
    }
    displayRecipes(meals);
  } catch (error) {
    console.error("Error loading favorites:", error);
    if (recipesContainer) {
      recipesContainer.innerHTML = `<p class="col-span-full text-center text-red-500">Failed to load favorites. Please try again.</p>`;
    }
  }
}

// Show main search/filter view
function showMainView() {
  viewingFavorites = false;
  if (toggleFavoritesBtn) {
    toggleFavoritesBtn.classList.remove("bg-green-600");
    toggleFavoritesBtn.classList.add("bg-red-500");
  }
  if (searchSection) {
    searchSection.style.display = "flex";
  }
  // repopulate suggestions to avoid blank page
  initialPopulate();
}

/** =============== EVENT HANDLERS =============== **/
function handleSearch() {
  viewingFavorites = false;
  if (toggleFavoritesBtn) {
    toggleFavoritesBtn.classList.remove("bg-green-600");
    toggleFavoritesBtn.classList.add("bg-red-500");
  }
  if (searchSection) {
    searchSection.style.display = "flex";
  }

  const query = searchInput.value.trim();
  if (query) {
    fetchRecipes(query);
  } else {
    initialPopulate();
  }
}

function handleMealTypeFilter() {
  viewingFavorites = false;
  if (toggleFavoritesBtn) {
    toggleFavoritesBtn.classList.remove("bg-green-600");
    toggleFavoritesBtn.classList.add("bg-red-500");
  }
  if (searchSection) {
    searchSection.style.display = "flex";
  }

  const type = mealTypeFilter.value;
  if (type) {
    fetchByMealType(type);
  } else {
    initialPopulate();
  }
}

function handleToggleFavorites() {
  if (viewingFavorites) {
    showMainView();
  } else {
    loadFavorites();
  }
}

// Initial app view (if already logged in on refresh)
if (isLoggedIn()) {
  // We need to wait for DOM to be fully loaded before initializing app variables
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      initAppVariables();
      initialPopulate();
    });
  } else {
    initAppVariables();
    initialPopulate();
  }
}