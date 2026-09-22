const express = require("express");
const crypto = require("crypto");
const path = require("path");
const { createClient } = require("@supabase/supabase-js");
const PicnicClient = require("picnic-api");
const { smartProductSearch, selectBestProduct } = require("../picnic-search.js");

const app = express();

// Supabase setup
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

// Login password
const LOGIN_PASSWORD = "neel";

app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

// ============================================================================
// AUTH (stateless signed cookie - safe across serverless invocations)
// ============================================================================

const SESSION_SECRET = "meal-planner-secret";
const COOKIE_NAME = "meal_auth";

function signToken() {
  return crypto.createHmac("sha256", SESSION_SECRET).update("authenticated").digest("hex");
}

function parseCookies(req) {
  const header = req.headers.cookie || "";
  const cookies = {};
  header.split(";").forEach((pair) => {
    const idx = pair.indexOf("=");
    if (idx > -1) {
      cookies[pair.slice(0, idx).trim()] = decodeURIComponent(pair.slice(idx + 1).trim());
    }
  });
  return cookies;
}

function isAuthenticated(req) {
  return parseCookies(req)[COOKIE_NAME] === signToken();
}

app.get("/login", (req, res) => {
  res.sendFile(path.join(process.cwd(), "meal-hub-public", "signin.html"));
});

app.post("/login", (req, res) => {
  const { password } = req.body;
  if (password === LOGIN_PASSWORD) {
    res.setHeader(
      "Set-Cookie",
      `${COOKIE_NAME}=${signToken()}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${60 * 60 * 24 * 30}`
    );
    res.redirect("/");
  } else {
    res.redirect("/login?error=1");
  }
});

app.get("/logout", (req, res) => {
  res.setHeader("Set-Cookie", `${COOKIE_NAME}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`);
  res.redirect("/login");
});

const STATIC_ASSET_PATTERN = /\.(ttf|otf|woff2?|png|ico|svg|jpe?g|css|js)$/i;

app.use((req, res, next) => {
  const publicPaths = ["/login", "/logout", "/api/login"];
  if (
    isAuthenticated(req) ||
    publicPaths.includes(req.path) ||
    STATIC_ASSET_PATTERN.test(req.path)
  ) {
    return next();
  }
  if (req.path.startsWith("/api/")) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  return res.redirect("/login");
});

app.use(express.static("meal-hub-public", { index: false }));

// Serve the app shell for any authenticated non-API, non-asset request
// (there's no index.html on disk - it was renamed to app.html - so Vercel's
// platform-level static/clean-URL serving can't intercept "/" before this
// route runs and the auth middleware above gets a chance to gate it).
app.get(/^(?!\/api\/).*/, (req, res) => {
  res.sendFile(path.join(process.cwd(), "meal-hub-public", "app.html"));
});

// ============================================================================
// STATIC DATA (classics, ingredients, translations)
// ============================================================================

const CLASSICS = [
  "Gebackene Kartoffeln mit Gemüse",
  "Paneer-Curry",
  "Shakshuka",
  "Schwedische Tacos",
  "Pad Thai",
  "Indisches Blumenkohl-Curry",
  "Galette (Gemüsekuchen)",
  "Patatas Tortilla mit griechischem Salat",
  "Ofengemüse mit griechischem Salat",
  "Halloumi Stroganoff",
  "Ragmunk",
];

const MEAL_INGREDIENTS = {
  "Gebackene Kartoffeln mit Gemüse": ["Kartoffeln", "Gemischtes Gemüse", "Olivenöl", "Kräuter"],
  "Paneer-Curry": ["Paneer", "Zwiebeln", "Tomaten", "Kokosmilch", "Kurkuma", "Kreuzkümmel"],
  "Shakshuka": ["Eier", "Tomaten", "Paprika", "Zwiebeln", "Knoblauch"],
  "Schwedische Tacos": ["Tortillas", "Linsenbraten", "Salat", "Sauerrahm", "Tomaten"],
  "Pad Thai": ["Reisnudeln", "Eier", "Edamame", "Karotten", "Erdnusssoße"],
  "Indisches Blumenkohl-Curry": ["Blumenkohl", "Tomaten", "Kokosmilch", "Kurkuma"],
  "Galette": ["Dinkelmehl", "Gemüse", "Eier", "Butter"],
  "Galette (Gemüsekuchen)": ["Dinkelmehl", "Gemüse", "Eier", "Butter"],
  "Gemüse-Quiche": ["Eier", "Crème fraîche", "Käse", "Gemüse", "Zwiebeln", "Knoblauch", "Mürbeteig"],
  "Pasta mit selbstgemachten vegetarischen Bällchen": ["Pasta", "Linsen", "Gemüse", "Brotkrümel", "Eier", "Gewürze"],
  "Auberginen-Parmigiana": ["Auberginen", "Tomaten", "Mozzarella", "Parmesan", "Basilikum", "Olivenöl", "Knoblauch"],
  "Patatas Tortilla mit griechischem Salat": ["Kartoffeln", "Eier", "Tomaten", "Gurke", "Feta"],
  "Ofengemüse mit griechischem Salat": ["Kartoffeln", "Karotten", "Zwiebeln", "Rote Beete", "Feta"],
  "Halloumi Stroganoff": ["Halloumi", "Zwiebeln", "Pilze", "Sojasauce", "Sauercreme", "Paprika"],
  "Ragmunk": ["Kartoffeln", "Zwiebeln", "Eier", "Mehl", "Salz"],
  "Pancakes": ["Mehl", "Eier", "Milch", "Butter", "Backpulver", "Zucker", "Salz"],
  "Pasta Carbonara": ["Pasta", "Eier", "Speck", "Parmesan", "Knoblauch", "Olivenöl", "Pfeffer", "Salz"],
  "köttbullar": ["Rinderhackfleisch", "Zwiebeln", "Semmelbrösel", "Eier", "Milch", "Butter", "Sojasauce", "Preiselbeeren"],
};

const RECIPE_URLS = {};  // Will be populated from scrapedMealUrls or when recipes are added

const SUGGESTIONS_INGREDIENTS = {
  "Bibimbap": ["Rice", "Beef", "Spinach", "Mushrooms", "Carrots", "Zucchini", "Egg", "Soy Sauce", "Sesame Oil", "Gochujang"],
  "Vegetable Paella": ["Rice", "Bell Pepper", "Tomatoes", "Onion", "Garlic", "Saffron", "Vegetable Broth", "Peas", "Artichoke", "Olive Oil"],
  "Lentil Curry": ["Red Lentils", "Coconut Milk", "Onion", "Garlic", "Ginger", "Tomatoes", "Turmeric", "Cumin", "Coriander", "Olive Oil"],
  "Ratatouille": ["Aubergine", "Courgettes", "Yellow Pepper", "Tomato", "Olive Oil", "Basil", "Onion", "Garlic Clove", "Red Wine Vinegar", "Sugar"],
  "Chickpea Stir-fry": ["Chickpeas", "Broccoli", "Carrot", "Bell Pepper", "Onion", "Garlic", "Soy Sauce", "Ginger", "Sesame Oil", "Rice"],
  "Vegetable Stir-fry with Rice": ["Rice", "Broccoli", "Carrot", "Bell Pepper", "Snap Peas", "Onion", "Garlic", "Soy Sauce", "Sesame Oil", "Ginger"],
  "Vegetable Frittata": ["Eggs", "Broccoli", "Bell Pepper", "Onion", "Mushrooms", "Cheese", "Olive Oil", "Salt", "Pepper", "Herbs"],
  "Thai Green Curry with Vegetables": ["Coconut Milk", "Green Curry Paste", "Bell Pepper", "Bamboo Shoots", "Basil", "Lime", "Fish Sauce", "Brown Sugar", "Vegetables", "Oil"],
  "Polenta with Tomato Ragù": ["Polenta", "Tomatoes", "Onion", "Garlic", "Carrot", "Celery", "Olive Oil", "Vegetable Broth", "Herbs", "Parmesan"],
  "Vegetable Quiche": ["Eggs", "Cream", "Cheese", "Spinach", "Mushrooms", "Onion", "Pie Crust", "Olive Oil", "Salt", "Pepper"],
  "Lentil Soup": ["Red Lentils", "Carrot", "Onion", "Celery", "Garlic", "Vegetable Broth", "Tomatoes", "Cumin", "Olive Oil", "Spinach"],
  "Carrot Soup": ["Carrots", "Onion", "Garlic", "Vegetable Broth", "Cream", "Ginger", "Olive Oil", "Salt", "Pepper", "Thyme"],
  "Potato Pancakes with Apples": ["Potatoes", "Apples", "Onion", "Eggs", "Flour", "Cinnamon", "Nutmeg", "Salt", "Pepper", "Oil"],
  "Root Vegetable Stew": ["Carrots", "Parsnips", "Sweet Potato", "Potatoes", "Onion", "Garlic", "Vegetable Broth", "Thyme", "Olive Oil", "Salt"],
  "Herb Omelette": ["Eggs", "Butter", "Parsley", "Chives", "Dill", "Salt", "Pepper", "Cheese", "Tomato", "Onion"],
  "Tomato Risotto": ["Arborio Rice", "Tomatoes", "Onion", "Garlic", "Vegetable Broth", "White Wine", "Parmesan", "Butter", "Olive Oil", "Basil"],
  "Quinoa Salad": ["Quinoa", "Cucumber", "Tomato", "Bell Pepper", "Red Onion", "Feta Cheese", "Lemon", "Olive Oil", "Herbs", "Salt"],
  "Gazpacho": ["Tomatoes", "Cucumber", "Bell Pepper", "Onion", "Garlic", "Olive Oil", "Red Wine Vinegar", "Bread", "Salt", "Pepper"],
  "Vegetable Lasagne": ["Pasta Sheets", "Ricotta", "Spinach", "Zucchini", "Tomato Sauce", "Mozzarella", "Parmesan", "Eggs", "Garlic", "Olive Oil"],
  "Chickpea Curry": ["Chickpeas", "Coconut Milk", "Onion", "Garlic", "Ginger", "Tomatoes", "Turmeric", "Cumin", "Cilantro", "Olive Oil"],
  "Nettle Soup": ["Nettles", "Potatoes", "Onion", "Garlic", "Vegetable Broth", "Cream", "Olive Oil", "Salt", "Pepper", "Nutmeg"],
  "Falafel with Tahini": ["Chickpeas", "Onion", "Garlic", "Parsley", "Cilantro", "Flour", "Spices", "Tahini", "Lemon", "Oil"],
  "Eggplant Moussaka": ["Eggplant", "Tomato Sauce", "Onion", "Garlic", "Minced Meat", "Béchamel Sauce", "Cheese", "Olive Oil", "Oregano", "Cinnamon"],
  "Mushroom Risotto": ["Arborio Rice", "Mushrooms", "Onion", "Garlic", "Vegetable Broth", "White Wine", "Parmesan", "Butter", "Olive Oil", "Thyme"],
  "Cauliflower Steaks": ["Cauliflower", "Olive Oil", "Garlic", "Thyme", "Lemon", "Salt", "Pepper", "Paprika", "Cumin", "Vegetables"],
  "Vegetable Tempura": ["Vegetables", "Flour", "Cornstarch", "Water", "Egg", "Baking Powder", "Salt", "Oil for frying", "Dipping Sauce", "Sesame Seeds"],
  "Lentil Bolognese": ["Lentils", "Tomato Sauce", "Onion", "Garlic", "Carrot", "Celery", "Olive Oil", "Herbs", "Tomato Paste", "Vegetable Broth"],
  "Butternut Squash Soup": ["Butternut Squash", "Onion", "Garlic", "Vegetable Broth", "Cream", "Nutmeg", "Olive Oil", "Salt", "Pepper", "Sage"],
  "Sauerkraut Stew": ["Sauerkraut", "Potatoes", "Carrots", "Onion", "Garlic", "Vegetable Broth", "Bay Leaves", "Thyme", "Olive Oil", "Caraway Seeds"],
  "Green Salad with Warm Potatoes": ["Potatoes", "Mixed Greens", "Spinach", "Arugula", "Cherry Tomatoes", "Red Onion", "Olive Oil", "Vinegar", "Mustard", "Herbs"],
};

const SUGGESTIONS = [
  "Bibimbap",
  "Vegetable Paella",
  "Lentil Curry",
  "Ratatouille",
  "Chickpea Stir-fry",
  "Vegetable Stir-fry with Rice",
  "Vegetable Frittata",
  "Thai Green Curry with Vegetables",
  "Polenta with Tomato Ragù",
  "Vegetable Quiche",
  "Lentil Soup",
  "Carrot Soup",
  "Potato Pancakes with Apples",
  "Root Vegetable Stew",
  "Herb Omelette",
  "Tomato Risotto",
  "Quinoa Salad",
  "Gazpacho",
  "Vegetable Lasagne",
  "Chickpea Curry",
  "Nettle Soup",
  "Falafel with Tahini",
  "Eggplant Moussaka",
  "Mushroom Risotto",
  "Cauliflower Steaks",
  "Vegetable Tempura",
  "Lentil Bolognese",
  "Butternut Squash Soup",
  "Sauerkraut Stew",
  "Green Salad with Warm Potatoes",
];

const INGREDIENT_TRANSLATIONS = {
  // Vegetables - Common
  "Aubergine": "Aubergine",
  "Courgettes": "Zucchini",
  "Zucchini": "Zucchini",
  "Yellow Pepper": "Gelbe Paprika",
  "Bell Pepper": "Paprika",
  "Red Pepper": "Rote Paprika",
  "Green Pepper": "Grüne Paprika",
  "Tomato": "Tomate",
  "Tomatoes": "Tomaten",
  "Cherry Tomatoes": "Kirschtomaten",
  "Onion": "Zwiebel",
  "Onions": "Zwiebeln",
  "Red Onion": "Rote Zwiebel",
  "Garlic": "Knoblauch",
  "Garlic Clove": "Knoblauchzehe",
  "Carrot": "Karotte",
  "Carrots": "Karotten",
  "Cucumber": "Gurke",
  "Broccoli": "Brokkoli",
  "Spinach": "Spinat",
  "Mushrooms": "Pilze",
  "Potatoes": "Kartoffeln",
  "Potato": "Kartoffel",
  "Sweet Potato": "Süßkartoffel",
  "Cauliflower": "Blumenkohl",
  "Celery": "Sellerie",
  "Parsnips": "Pastinaken",
  "Leek": "Lauch",
  "Peas": "Erbsen",
  "Green Peas": "Grüne Erbsen",
  "Snap Peas": "Zuckererbsen",
  "Bean Sprouts": "Bohnensprossen",
  "Asparagus": "Spargel",
  "Arugula": "Rucola",
  "Lettuce": "Salat",
  "Mixed Greens": "Gemischte Grüntöne",
  "Kale": "Grünkohl",
  "Cabbage": "Kohl",
  "Red Cabbage": "Rotkohl",
  "Beet": "Rübe",
  "Radish": "Rettich",
  "Turnip": "Steckrübe",
  "Pumpkin": "Kürbis",
  "Butternut Squash": "Butternut-Kürbis",
  "Zucchini": "Zucchini",
  "Eggplant": "Aubergine",
  "Bell Pepper": "Paprika",
  "Chili Pepper": "Chili-Pfeffer",
  "Corn": "Mais",
  "Olive": "Olive",

  // Legumes & Grains
  "Chickpeas": "Kichererbsen",
  "Chickpea": "Kichererbse",
  "Lentils": "Linsen",
  "Red Lentils": "Rote Linsen",
  "Green Lentils": "Grüne Linsen",
  "Black Beans": "Schwarze Bohnen",
  "Kidney Beans": "Kidney-Bohnen",
  "Pinto Beans": "Pintobohnen",
  "White Beans": "Weiße Bohnen",
  "Rice": "Reis",
  "White Rice": "Weißer Reis",
  "Brown Rice": "Brauner Reis",
  "Arborio Rice": "Arborio Reis",
  "Basmati Rice": "Basmati-Reis",
  "Jasmine Rice": "Jasmin-Reis",
  "Wild Rice": "Wildreis",
  "Quinoa": "Quinoa",
  "Couscous": "Couscous",
  "Pasta": "Pasta",
  "Noodles": "Nudeln",
  "Ramen": "Ramen",
  "Wheat": "Weizen",
  "Barley": "Gerste",
  "Oats": "Hafer",
  "Oatmeal": "Haferflocken",

  // Proteins & Meat
  "Eggs": "Eier",
  "Egg": "Ei",
  "Chicken": "Hähnchen",
  "Chicken Breast": "Hähnchenbrust",
  "Ground Chicken": "Hähnchengehacktes",
  "Beef": "Rindfleisch",
  "Ground Beef": "Rindgehacktes",
  "Minced Meat": "Hackfleisch",
  "Pork": "Schweinefleisch",
  "Lamb": "Lamm",
  "Turkey": "Pute",
  "Duck": "Ente",
  "Fish": "Fisch",
  "Salmon": "Lachs",
  "Cod": "Kabeljau",
  "Shrimp": "Garnelen",
  "Prawns": "Gambas",
  "Squid": "Tintenfisch",
  "Octopus": "Krake",
  "Paneer": "Paneer",
  "Tofu": "Tofu",
  "Tempeh": "Tempeh",
  "Seitan": "Seitan",

  // Dairy & Cheese
  "Cheese": "Käse",
  "Feta": "Feta",
  "Mozzarella": "Mozzarella",
  "Parmesan": "Parmesan",
  "Cheddar": "Cheddar",
  "Gouda": "Gouda",
  "Brie": "Brie",
  "Cream Cheese": "Frischkäse",
  "Ricotta": "Ricotta",
  "Halloumi": "Halloumi",
  "Cream": "Sahne",
  "Sour Cream": "Sauerrahm",
  "Crème Fraîche": "Crème Fraîche",
  "Yogurt": "Joghurt",
  "Greek Yogurt": "Griechisches Joghurt",
  "Butter": "Butter",
  "Milk": "Milch",
  "Whole Milk": "Vollmilch",
  "Skim Milk": "Magermilch",

  // Oils & Fats
  "Olive Oil": "Olivenöl",
  "Extra Virgin Olive Oil": "Natives Olivenöl Extra",
  "Sesame Oil": "Sesamöl",
  "Vegetable Oil": "Pflanzenöl",
  "Canola Oil": "Rapsöl",
  "Coconut Oil": "Kokosöl",
  "Sunflower Oil": "Sonnenblumenöl",
  "Peanut Oil": "Erdnussöl",
  "Butter": "Butter",
  "Ghee": "Ghee",

  // Sauces, Condiments & Flavourings
  "Soy Sauce": "Sojasauce",
  "Tamari": "Tamari",
  "Vinegar": "Essig",
  "Red Wine Vinegar": "Rotweinessig",
  "White Wine Vinegar": "Weißweinessig",
  "Balsamic Vinegar": "Balsamico-Essig",
  "Apple Cider Vinegar": "Apfelweinessig",
  "Fish Sauce": "Fischsoße",
  "Worcestershire Sauce": "Worcestershire-Soße",
  "Hot Sauce": "Würzsauce",
  "Tomato Sauce": "Tomatensoße",
  "Tomato Paste": "Tomatenmark",
  "Tomato Ketchup": "Tomaten-Ketchup",
  "BBQ Sauce": "BBQ-Soße",
  "Oyster Sauce": "Austernsoße",
  "Hoisin Sauce": "Hoisin-Soße",
  "Sriracha": "Sriracha",
  "Pesto": "Pesto",
  "Mayonnaise": "Mayonnaise",
  "Mustard": "Senf",
  "Yellow Mustard": "Gelber Senf",
  "Dijon Mustard": "Dijon-Senf",
  "Tahini": "Tahini",
  "Peanut Butter": "Erdnussbutter",
  "Almond Butter": "Mandelbutter",
  "Coconut Butter": "Kokosbutter",
  "Miso Paste": "Miso-Paste",
  "Curry Paste": "Currypaste",
  "Red Curry Paste": "Rote Currypaste",
  "Green Curry Paste": "Grüne Currypaste",
  "Gochujang": "Gochujang",
  "Harissa": "Harissa",

  // Spices & Herbs
  "Salt": "Salz",
  "Sea Salt": "Meersalz",
  "Black Pepper": "Schwarzer Pfeffer",
  "Pepper": "Pfeffer",
  "White Pepper": "Weißer Pfeffer",
  "Turmeric": "Kurkuma",
  "Cumin": "Kreuzkümmel",
  "Coriander": "Koriander",
  "Cinnamon": "Zimt",
  "Nutmeg": "Muskatnuss",
  "Paprika": "Paprika",
  "Chili Powder": "Chili-Pulver",
  "Cayenne Pepper": "Cayenne-Pfeffer",
  "Ginger": "Ingwer",
  "Garlic Powder": "Knoblauchpulver",
  "Onion Powder": "Zwiebelpulver",
  "Cumin Seeds": "Kreuzkümmel-Samen",
  "Sesame Seeds": "Sesamkörner",
  "Mustard Seeds": "Senfkörner",
  "Caraway Seeds": "Kümmel",
  "Fennel Seeds": "Fenchelsamen",
  "Fenugreek": "Bockshornklee",
  "Cloves": "Nelken",
  "Cardamom": "Kardamom",
  "Bay Leaf": "Lorbeerblatt",
  "Star Anise": "Sternanis",
  "Black Cumin": "Schwarzkümmel",

  // Fresh Herbs
  "Basil": "Basilikum",
  "Parsley": "Petersilie",
  "Cilantro": "Koriander",
  "Thyme": "Thymian",
  "Oregano": "Oregano",
  "Rosemary": "Rosmarin",
  "Sage": "Salbei",
  "Mint": "Minze",
  "Dill": "Dill",
  "Chives": "Schnittlauch",
  "Tarragon": "Estragon",
  "Marjoram": "Majoran",
  "Lemongrass": "Zitronengras",
  "Herbs": "Kräuter",

  // Liquids & Broths
  "Vegetable Broth": "Gemüsebrühe",
  "Chicken Broth": "Hühnerbrühe",
  "Beef Broth": "Rinderbrühe",
  "Fish Stock": "Fischfond",
  "Coconut Milk": "Kokosmilch",
  "Almond Milk": "Mandelmilch",
  "Oat Milk": "Hafermilch",
  "White Wine": "Weißwein",
  "Red Wine": "Rotwein",
  "Beer": "Bier",
  "Butter Beans": "Butterbohnen",
  "Tomato Puree": "Tomatenmark",
  "Tomato Purée": "Tomatenmark",
  "Spanish Onion": "Zwiebel",
  "Flat-leaf Parsley": "Petersilie",
  "Greek Olive Oil": "Olivenöl",
  "Ketchup": "Ketchup",
  "Bread Crumbs": "Semmelbrösel",
  "Breadcrumbs": "Semmelbrösel",
  "Yellow Onion": "Zwiebel",
  "Smoked Paprika": "Paprikapulver geräuchert",
  "Feta Cheese": "Feta",
  "Zucchinis": "Zucchini",
  "Mozzarella Cheese": "Mozzarella",
  "Sea Salt": "Meersalz",
  "Chicken Stock": "Hühnerbrühe",
  "Beef Stock": "Rinderbrühe",
  "Vegetable Stock": "Gemüsebrühe",

  // Fruits
  "Apple": "Apfel",
  "Apples": "Äpfel",
  "Banana": "Banane",
  "Orange": "Orange",
  "Lemon": "Zitrone",
  "Lime": "Limette",
  "Strawberry": "Erdbeere",
  "Blueberry": "Blaubeere",
  "Raspberry": "Himbeere",
  "Blackberry": "Brombeere",
  "Pineapple": "Ananas",
  "Mango": "Mango",
  "Papaya": "Papaya",
  "Coconut": "Kokosnuss",
  "Avocado": "Avocado",
  "Grape": "Traube",
  "Watermelon": "Wassermelone",
  "Peach": "Pfirsich",
  "Pear": "Birne",
  "Plum": "Pflaume",
  "Kiwi": "Kiwi",
  "Pomegranate": "Granatapfel",

  // Baking & Dry Goods
  "Flour": "Mehl",
  "All-Purpose Flour": "Universalmehl",
  "Whole Wheat Flour": "Vollkornmehl",
  "Cornstarch": "Speisestärke",
  "Baking Powder": "Backpulver",
  "Baking Soda": "Natron",
  "Yeast": "Hefe",
  "Sugar": "Zucker",
  "Brown Sugar": "Brauner Zucker",
  "Powdered Sugar": "Puderzucker",
  "Honey": "Honig",
  "Maple Syrup": "Ahornsirup",
  "Molasses": "Melasse",
  "Vanilla Extract": "Vanilleextrakt",
  "Almond Extract": "Mandelextrakt",

  // Nuts & Seeds
  "Almond": "Mandel",
  "Almonds": "Mandeln",
  "Walnut": "Walnuss",
  "Walnuts": "Walnüsse",
  "Cashew": "Cashew",
  "Cashews": "Cashews",
  "Hazelnut": "Haselnuss",
  "Pecans": "Pekannüsse",
  "Pine Nuts": "Pinienkerne",
  "Sunflower Seeds": "Sonnenblumenkerne",
  "Pumpkin Seeds": "Kürbiskerne",
  "Flax Seeds": "Leinsamen",
  "Chia Seeds": "Chiasamen",

  // Seafood
  "Salmon": "Lachs",
  "Trout": "Forelle",
  "Cod": "Kabeljau",
  "Haddock": "Schellfisch",
  "Sardines": "Sardinen",
  "Anchovies": "Sardellen",
  "Tuna": "Thunfisch",
  "Mackerel": "Makrele",
  "Herring": "Hering",
  "Mussels": "Muscheln",
  "Clams": "Muscheln",
  "Oysters": "Austern",
  "Shrimp": "Garnelen",
  "Prawns": "Gambas",
  "Squid": "Tintenfisch",
  "Octopus": "Krake",

  // Bread & Baked Goods
  "Bread": "Brot",
  "White Bread": "Weißbrot",
  "Whole Wheat Bread": "Vollkornbrot",
  "Rye Bread": "Roggenbrot",
  "Sourdough": "Sauerteig",
  "Baguette": "Baguette",
  "Flatbread": "Fladenbrot",
  "Tortilla": "Tortilla",
  "Tortillas": "Tortillas",
  "Pita": "Pita",
  "Naan": "Naan",
  "Croissant": "Croissant",

  // Miscellaneous
  "Bamboo Shoots": "Bambussprossen",
  "Artichoke": "Artischocke",
  "Okra": "Okra",
  "Eggplant": "Aubergine",
  "Saffron": "Safran",
  "Capers": "Kapern",
  "Olives": "Oliven",
  "Sun-Dried Tomatoes": "Getrocknete Tomaten",
  "Raisins": "Rosinen",
  "Dates": "Datteln",
  "Prunes": "Pflaumen",
  "Jaggery": "Jaggery",
};

const BASELINE_ITEMS = [
  "König Frischkäse",
  "Joghurt",
  "Skyr",
  "Cheddar",
  "Eier",
  "Haferdrink Bio",
  "Butter",
  "Crème fraîche",
  "Kuhmilch",
  "Tomaten",
  "Gurke",
  "Kartoffeln",
  "Nüsse Bio",
  "Äpfel Bio",
  "Reiswaffeln",
  "Brot",
  "Limette",
  "Sardinen",
];

// ============================================================================
// DATA LOADING / SAVING (Supabase)
// ============================================================================

function getDefaultData() {
  return {
    orderMeals: [],
    nextWeekMeals: [],
    shoppingList: [...BASELINE_ITEMS],
    extraItems: [],
    itemQuantities: {},
    classics: [...CLASSICS],
    cookedMeals: [],
    receipts: [],
    picnicCosts: [],
    picnicCredentials: null,
    picnicAuthKey: null,
    picnicSyncSession: null,
    picnicPurchaseHistoryProducts: [],
    recipeShoppingLines: {},
    scrapedMeals: {},
    scrapedMealUrls: {},
    costCache: { totals: null, stores: null, lastUpdated: null },
    lastWeeklyRefresh: null,
    lastUpdated: new Date().toISOString(),
  };
}

async function initializeDatabase() {
  try {
    const { data: existing } = await supabase
      .from("meals")
      .select("id")
      .eq("id", "main")
      .maybeSingle();

    if (!existing) {
      await supabase.from("meals").insert([{ id: "main", data: getDefaultData() }]);
    }
  } catch (err) {
    console.log("Database tables ready or already exist");
  }
}

async function loadData() {
  try {
    const { data, error } = await supabase
      .from("meals")
      .select("data")
      .eq("id", "main")
      .single();

    if (error) throw error;
    const loaded = data?.data || getDefaultData();
    const defaults = getDefaultData();
    // Backfill any missing fields (e.g. after a schema upgrade)
    return { ...defaults, ...loaded };
  } catch (err) {
    console.error("Error loading data:", err);
    return getDefaultData();
  }
}

async function saveData(data) {
  data.lastUpdated = new Date().toISOString();
  try {
    await supabase.from("meals").update({ data }).eq("id", "main");
  } catch (err) {
    console.error("Error saving data:", err);
  }
}

// ============================================================================
// HELPERS
// ============================================================================

function cleanIngredient(ingredient) {
  const descriptiveWords = [
    'large', 'medium', 'small', 'extra', 'generous', 'handful', 'pinch',
    'fresh', 'dried', 'ground', 'whole', 'chopped', 'diced', 'minced',
    'sliced', 'grated', 'shredded', 'cubed', 'crushed', 'roughly',
    'finely', 'coarsely', 'thinly', 'thick', 'halved', 'quartered',
    'peeled', 'seeded', 'cored', 'trimmed', 'pitted', 'rinsed', 'drained',
    'melted', 'softened', 'room', 'temperature', 'cold', 'hot', 'warm',
    'plus', 'extra', 'more', 'or', 'alternatively', 'optional', 'if', 'needed',
    'free-range', 'organic', 'ripe', 'raw', 'cooked', 'tinned', 'canned',
    'frozen', 'roasted', 'toasted', 'blanched', 'boiled', 'fried', 'baked',
    'in', 'total', 'approximately', 'about', 'around', 'are', 'also', 'with'
  ];

  let quantities = [];
  const quantityPattern = /\b(\d+[\d\s.\/\-xX]*(?:tbsp|tsp|g|ml|l|kg|oz|cup|cups|lbs?|lb)\b|(?:tbsp|tsp|g|ml|l|kg|oz|cup|cups|lbs?|lb)\b)/gi;
  let match;
  while ((match = quantityPattern.exec(ingredient)) !== null) {
    quantities.push(match[0].trim());
  }

  let cleanedText = ingredient;
  cleanedText = cleanedText.replace(/\b(\d+[\d\s.\/\-xX]*(?:tbsp|tsp|g|ml|l|kg|oz|cup|cups|lbs?|lb)\b|(?:tbsp|tsp|g|ml|l|kg|oz|cup|cups|lbs?|lb)\b)/gi, ' ').trim();

  const wordsToRemove = new RegExp(`\\b(${descriptiveWords.join('|')})\\b`, 'gi');
  cleanedText = cleanedText.replace(wordsToRemove, ' ').trim();
  cleanedText = cleanedText.replace(/\([^)]*\)/g, ' ').trim();
  cleanedText = cleanedText.split(';')[0].trim();
  cleanedText = cleanedText.replace(/\s+/g, ' ').trim();

  const quantitiesWithNumbers = quantities.filter(q => /\d/.test(q));

  let result = '';
  if (quantitiesWithNumbers.length > 0) {
    result = quantitiesWithNumbers.join(' ') + (cleanedText ? ' ' + cleanedText : '');
  } else {
    result = cleanedText;
  }

  return result.trim() || ingredient;
}

function translateIngredient(ingredient) {
  const cleaned = cleanIngredient(ingredient);

  if (INGREDIENT_TRANSLATIONS[cleaned]) {
    return INGREDIENT_TRANSLATIONS[cleaned];
  }

  const lowerCleaned = cleaned.toLowerCase();
  for (const [eng, ger] of Object.entries(INGREDIENT_TRANSLATIONS)) {
    if (eng.toLowerCase() === lowerCleaned) {
      return ger;
    }
  }

  let result = cleaned;
  const sortedIngredients = Object.entries(INGREDIENT_TRANSLATIONS)
    .sort((a, b) => b[0].split(' ').length - a[0].split(' ').length);

  for (const [eng, ger] of sortedIngredients) {
    const engPattern = eng.toLowerCase();
    const resultLower = result.toLowerCase();
    if (resultLower.includes(engPattern)) {
      const regex = new RegExp(`\\b${eng.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi');
      result = result.replace(regex, ger);
    }
  }

  return result;
}

// MyMemory is a free, keyless translation API - no signup, no billing
// account, generous rate limit for short phrases like grocery items.
// Used only as a fallback when the curated INGREDIENT_TRANSLATIONS
// dictionary has no entry, so common items stay fast/offline and only
// unusual ones pay for a network round trip.
async function translateToGermanFallback(text) {
  try {
    const response = await fetch(
      `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=en|de`,
      { signal: AbortSignal.timeout(4000) }
    );
    const result = await response.json();
    const translated = result?.responseData?.translatedText;
    const quality = result?.responseData?.match;
    if (translated && quality >= 0.5) {
      return translated.replace(/[.!?]+$/, "").trim();
    }
  } catch (err) {
    console.log("MyMemory translation fallback failed:", err.message);
  }
  return null;
}

// Tries the curated dictionary first (instant, no network call); only
// falls back to the translation API when nothing in the dictionary
// matched at all, so it stays fast for the ~300 already-known items.
async function translateIngredientWithFallback(ingredient) {
  const cleaned = cleanIngredient(ingredient);
  const dictResult = translateIngredient(ingredient);

  if (dictResult.toLowerCase() !== cleaned.toLowerCase()) {
    return dictResult; // Dictionary found (or partially substituted) something.
  }

  const apiResult = await translateToGermanFallback(cleaned);
  return apiResult || dictResult;
}

function getMealIngredients(mealName, scrapedMeals = {}) {
  if (scrapedMeals[mealName]) return scrapedMeals[mealName];
  if (MEAL_INGREDIENTS[mealName]) return MEAL_INGREDIENTS[mealName];
  if (SUGGESTIONS_INGREDIENTS[mealName]) {
    return SUGGESTIONS_INGREDIENTS[mealName].map(ing => translateIngredient(ing));
  }
  return [];
}

function buildIngredientToMealsMap(orderMeals, scrapedMeals = {}) {
  const map = {};
  orderMeals.forEach(meal => {
    const ingredients = getMealIngredients(meal, scrapedMeals);
    ingredients.forEach(ing => {
      // Register both the ingredient as written and the shopping-list line
      // it becomes, so lines added from scraped recipes still match here.
      new Set([ing.toLowerCase(), ...toShoppingLines(ing).map(l => l.toLowerCase())]).forEach(key => {
        if (!map[key]) map[key] = [];
        if (!map[key].includes(meal)) map[key].push(meal);
      });
    });
  });
  return map;
}

function syncShoppingListWithMeals(data) {
  const orderMeals = data.orderMeals || [];
  const ingredientMap = buildIngredientToMealsMap(orderMeals, data.scrapedMeals || {});

  if (data.extraItems && data.extraItems.length > 0) {
    data.extraItems = data.extraItems.filter(item => {
      const itemLower = item.toLowerCase();
      return ingredientMap[itemLower] && ingredientMap[itemLower].length > 0;
    });
  }
}

function addIngredientsToShoppingList(data, meal) {
  const ingredients = getMealIngredients(meal, data.scrapedMeals || {});
  ingredients.forEach(ing => {
    if (!data.shoppingList.includes(ing) && !data.extraItems.includes(ing)) {
      data.extraItems.push(ing);
    }
  });
}

function parseReceiptDate(dateStr) {
  if (!dateStr) return null;
  const parts = dateStr.split('.');
  if (parts.length === 3) {
    return new Date(parts[2], parts[1] - 1, parts[0]);
  }
  return new Date(dateStr);
}

function getDatePeriod(date, now) {
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const yearAgo = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
  const periods = [];
  if (date >= weekAgo) periods.push('week');
  if (date >= monthAgo) periods.push('month');
  if (date >= yearAgo) periods.push('year');
  return periods;
}

// ============================================================================
// AUTH
// ============================================================================

app.post("/api/login", (req, res) => {
  const { password } = req.body;
  if (password === LOGIN_PASSWORD) {
    res.json({ success: true });
  } else {
    res.status(401).json({ success: false, error: "Invalid password" });
  }
});

// ============================================================================
// CORE DATA
// ============================================================================

app.get("/api/data", async (req, res) => {
  try {
    res.json(await loadData());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/data", async (req, res) => {
  try {
    await saveData(req.body);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================================
// MEALS (current week plan)
// ============================================================================

app.post("/api/meals", async (req, res) => {
  const { action, meal } = req.body;
  try {
    const data = await loadData();

    if (action === "add" && !data.orderMeals.includes(meal)) {
      data.orderMeals.push(meal);
      addIngredientsToShoppingList(data, meal);
    } else if (action === "remove") {
      data.orderMeals = data.orderMeals.filter((m) => m !== meal);
      syncShoppingListWithMeals(data);
    } else if (action === "clear") {
      data.orderMeals = [];
      data.extraItems = [];
      data.cookedMeals = [];
    }

    await saveData(data);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/update-weekly-menu", async (req, res) => {
  const { meals } = req.body;
  if (!Array.isArray(meals)) {
    return res.json({ success: false, error: "Invalid meals data" });
  }
  try {
    const data = await loadData();
    data.orderMeals = meals;
    data.nextWeekMeals = [];
    // A new week starts fresh: nothing is crossed out yet. (This used to
    // carry over, so a meal cooked last week showed crossed out again.)
    data.cookedMeals = [];
    data.lastWeeklyRefresh = new Date().toISOString();
    syncShoppingListWithMeals(data);
    pruneRecipeLines(data);
    await saveData(data);
    res.json(data);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get("/api/get-meals", async (req, res) => {
  try {
    const data = await loadData();
    res.json({ meals: data.orderMeals || [] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/next-week-meals", async (req, res) => {
  try {
    const data = await loadData();
    res.json({
      success: true,
      nextWeekMeals: data.nextWeekMeals || [],
      count: (data.nextWeekMeals || []).length,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/next-week-meals", async (req, res) => {
  const { action, meal } = req.body;
  try {
    const data = await loadData();
    if (!data.nextWeekMeals) data.nextWeekMeals = [];

    if (action === "add" && !data.nextWeekMeals.includes(meal)) {
      data.nextWeekMeals.push(meal);
    } else if (action === "remove") {
      data.nextWeekMeals = data.nextWeekMeals.filter((m) => m !== meal);
      removeRecipeLinesForMeal(data, meal);
    } else if (action === "clear") {
      data.nextWeekMeals = [];
    }

    await saveData(data);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/favorites", async (req, res) => {
  const { action, meal } = req.body;
  try {
    const data = await loadData();
    if (!data.classics) data.classics = [];

    if (action === "toggle") {
      if (data.classics.includes(meal)) {
        data.classics = data.classics.filter((m) => m !== meal);
      } else {
        data.classics.push(meal);
      }
    }

    await saveData(data);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/classics", async (req, res) => {
  const { action, meal } = req.body;
  try {
    const data = await loadData();
    if (action === "add" && !data.classics.includes(meal)) {
      data.classics.push(meal);
    } else if (action === "remove") {
      data.classics = data.classics.filter((m) => m !== meal);
    }
    await saveData(data);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/cooked-meals", async (req, res) => {
  const { action, meal } = req.body;
  try {
    const data = await loadData();
    if (!data.cookedMeals) data.cookedMeals = [];

    if (action === "add" && !data.cookedMeals.includes(meal)) {
      data.cookedMeals.push(meal);
    } else if (action === "remove") {
      data.cookedMeals = data.cookedMeals.filter((m) => m !== meal);
    }

    await saveData(data);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================================
// SHOPPING LIST
// ============================================================================

app.get("/api/shopping-list", async (req, res) => {
  try {
    const data = await loadData();
    res.json({ items: [...data.shoppingList, ...data.extraItems] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Item quantities. 1 is the default and isn't stored; only other values are
// kept, keyed by lowercase item name. A baseline item set to 0 stays on the
// list but is skipped when the list is sent to Picnic ("we have enough").
function quantityKey(item) {
  return String(item || "").trim().toLowerCase();
}

function getItemQuantity(data, item) {
  const q = (data.itemQuantities || {})[quantityKey(item)];
  return Number.isInteger(q) ? q : 1;
}

function setItemQuantity(data, item, quantity) {
  if (!data.itemQuantities) data.itemQuantities = {};
  const key = quantityKey(item);
  if (quantity === 1) delete data.itemQuantities[key];
  else data.itemQuantities[key] = quantity;
}

function dropItemQuantity(data, item) {
  if (data.itemQuantities) delete data.itemQuantities[quantityKey(item)];
}

// Everything that should actually go into the Picnic cart.
function itemsToOrder(data) {
  return [...(data.shoppingList || []), ...(data.extraItems || [])].filter(
    (item) => getItemQuantity(data, item) > 0
  );
}

app.post("/api/item-quantity", async (req, res) => {
  const { item, quantity, reset } = req.body || {};
  try {
    const data = await loadData();

    if (reset) {
      data.itemQuantities = {};
    } else {
      const name = String(item || "").trim();
      if (!name) return res.status(400).json({ error: "Item is required" });
      const qty = Number(quantity);
      if (!Number.isInteger(qty) || qty < 0 || qty > 99) {
        return res.status(400).json({ error: "Quantity must be a whole number from 0 to 99" });
      }
      const key = quantityKey(name);
      const isBaseline = (data.shoppingList || []).some((i) => quantityKey(i) === key);
      const isListed = isBaseline || (data.extraItems || []).some((i) => quantityKey(i) === key);
      if (!isListed) return res.status(404).json({ error: "Item is not on the shopping list" });
      // Only baseline items can be 0; a new item you don't want is just removed.
      setItemQuantity(data, name, isBaseline ? qty : Math.max(qty, 1));
    }

    await saveData(data);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Called once an "Auto-Add to Picnic" sync finishes: items that actually
// made it into the cart come off the shopping list (a baseline item goes
// back to its default amount of 1 rather than being removed). Items Picnic
// couldn't find are left in place so they aren't silently forgotten.
app.post("/api/picnic-sync-complete", async (req, res) => {
  const { addedItems } = req.body || {};
  try {
    const data = await loadData();
    const added = Array.isArray(addedItems) ? addedItems : [];
    const addedKeys = new Set(added.map(quantityKey));

    data.extraItems = (data.extraItems || []).filter((i) => !addedKeys.has(quantityKey(i)));
    added.forEach((item) => {
      const isBaseline = (data.shoppingList || []).some((i) => quantityKey(i) === quantityKey(item));
      if (isBaseline) setItemQuantity(data, item, 1);
      else dropItemQuantity(data, item);
    });

    await saveData(data);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/shopping", async (req, res) => {
  let { action, item, oldName } = req.body;
  try {
    const data = await loadData();

    if (action === "rename") {
      const newItem = translateIngredient(item);

      const oldQty = getItemQuantity(data, oldName);
      dropItemQuantity(data, oldName);
      if (oldQty !== 1) setItemQuantity(data, newItem, oldQty);

      const shoppingIndex = data.shoppingList.findIndex(i => i === oldName || i.toLowerCase() === oldName?.toLowerCase());
      if (shoppingIndex !== -1) data.shoppingList[shoppingIndex] = newItem;

      const extraIndex = data.extraItems.findIndex(i => i === oldName || i.toLowerCase() === oldName?.toLowerCase());
      if (extraIndex !== -1) data.extraItems[extraIndex] = newItem;
    } else {
      if ((action === "remove" || action === "toggle-have") && item) {
        let foundItem = data.shoppingList.find(i => i === item) || data.extraItems.find(i => i === item);
        if (!foundItem) {
          foundItem = data.shoppingList.find(i => i.toLowerCase() === item.toLowerCase()) ||
                      data.extraItems.find(i => i.toLowerCase() === item.toLowerCase());
        }
        if (foundItem) {
          item = foundItem;
        } else {
          item = translateIngredient(item);
        }
      } else if (action === "add") {
        item = await translateIngredientWithFallback(item);
      }

      const itemLower = (item || "").toLowerCase();
      const existsCaseInsensitive = (list) => list.some((i) => i.toLowerCase() === itemLower);

      if (action === "add" && !existsCaseInsensitive(data.shoppingList) && !existsCaseInsensitive(data.extraItems)) {
        data.extraItems.unshift(item);
      } else if (action === "remove") {
        data.shoppingList = data.shoppingList.filter((i) => i !== item);
        data.extraItems = data.extraItems.filter((i) => i !== item);
        dropItemQuantity(data, item);
      } else if (action === "toggle-have") {
        data.shoppingList = data.shoppingList.filter((i) => i !== item);
        data.extraItems = data.extraItems.filter((i) => i !== item);
        dropItemQuantity(data, item);
      } else if (action === "promote-to-baseline") {
        data.extraItems = data.extraItems.filter((i) => i.toLowerCase() !== itemLower);
        if (!existsCaseInsensitive(data.shoppingList)) data.shoppingList.push(item);
      } else if (action === "remove-from-baseline") {
        data.shoppingList = data.shoppingList.filter((i) => i.toLowerCase() !== itemLower);
        if (!existsCaseInsensitive(data.extraItems)) data.extraItems.unshift(item);
        dropItemQuantity(data, item);
      }
    }

    await saveData(data);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/update-shopping-list", async (req, res) => {
  const { items } = req.body;
  try {
    const data = await loadData();
    data.extraItems = items;
    await saveData(data);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================================
// RECEIPTS & COSTS
// ============================================================================

app.post("/api/receipts", async (req, res) => {
  const { action, receipt, index } = req.body;
  try {
    const data = await loadData();
    if (!data.receipts) data.receipts = [];

    if (action === "add" && receipt) {
      data.receipts.push({ ...receipt, savedAt: new Date().toISOString() });
    } else if (action === "delete" && typeof index === "number") {
      if (index >= 0 && index < data.receipts.length) {
        data.receipts.splice(index, 1);
      }
    }

    await saveData(data);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/picnic-costs", async (req, res) => {
  const { action, cost, index } = req.body;
  try {
    const data = await loadData();
    if (!data.picnicCosts) data.picnicCosts = [];

    if (action === "add" && cost) {
      data.picnicCosts.push({ ...cost, savedAt: new Date().toISOString() });
    } else if (action === "delete" && typeof index === "number") {
      if (index >= 0 && index < data.picnicCosts.length) {
        data.picnicCosts.splice(index, 1);
      }
    }

    await saveData(data);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/combined-costs", async (req, res) => {
  try {
    const data = await loadData();
    const now = new Date();
    const costsByStore = {};

    const picnicCosts = data.picnicCosts || [];
    if (picnicCosts.length > 0) {
      costsByStore['Picnic'] = { week: 0, month: 0, year: 0, items: [] };
      picnicCosts.forEach(cost => {
        const costDate = new Date(cost.date);
        const amount = typeof cost.amount === 'string' ? parseFloat(cost.amount) : cost.amount || 0;
        const periods = getDatePeriod(costDate, now);
        periods.forEach(period => { costsByStore['Picnic'][period] += amount; });
        costsByStore['Picnic'].items.push({ date: costDate.toLocaleDateString('de-DE'), amount });
      });
    }

    const receipts = data.receipts || [];
    receipts.forEach(receipt => {
      const receiptDate = parseReceiptDate(receipt.date);
      if (!receiptDate || isNaN(receiptDate.getTime())) return;

      const store = receipt.store || 'Unknown';
      const amount = parseFloat(receipt.amount) || 0;

      if (!costsByStore[store]) costsByStore[store] = { week: 0, month: 0, year: 0, items: [] };

      const periods = getDatePeriod(receiptDate, now);
      periods.forEach(period => { costsByStore[store][period] += amount; });
      costsByStore[store].items.push({ date: receipt.date, amount });
    });

    let totals = { week: 0, month: 0, year: 0 };
    let stores = {};
    Object.entries(costsByStore).forEach(([storeName, storeData]) => {
      totals.week += storeData.week;
      totals.month += storeData.month;
      totals.year += storeData.year;
      stores[storeName] = {
        week: storeData.week,
        month: storeData.month,
        year: storeData.year,
        itemCount: storeData.items.length,
        items: storeData.items,
      };
    });

    const timestamp = new Date().toISOString();
    data.costCache = { totals, stores, lastUpdated: timestamp };
    await saveData(data);

    res.json({ success: true, totals, stores, timestamp, cached: false, hoursSinceUpdate: 0 });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

app.get("/api/order-costs", async (req, res) => {
  try {
    const data = await loadData();
    if (data.costCache && data.costCache.stores) {
      const picnicStore = data.costCache.stores['Picnic'] || { week: 0, month: 0, year: 0, itemCount: 0 };
      return res.json({
        success: true,
        weekCost: picnicStore.week,
        weekOrders: picnicStore.itemCount,
        monthCost: picnicStore.month,
        monthOrders: picnicStore.itemCount,
        yearCost: picnicStore.year,
        yearOrders: picnicStore.itemCount,
      });
    }
    res.json({ success: true, weekCost: 0, weekOrders: 0, monthCost: 0, monthOrders: 0, yearCost: 0, yearOrders: 0 });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

// ============================================================================
// MEAL INGREDIENTS & RECIPE SCRAPING
// ============================================================================

app.get("/api/ingredient-to-meals", async (req, res) => {
  try {
    const data = await loadData();
    const allMeals = [...(data.orderMeals || []), ...(data.nextWeekMeals || [])];
    const mapping = buildIngredientToMealsMap(allMeals, data.scrapedMeals || {});
    res.json(mapping);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/meal-ingredients/:meal", (req, res) => {
  const meal = decodeURIComponent(req.params.meal);
  const ingredients = MEAL_INGREDIENTS[meal] || [];
  res.json({ meal, ingredients });
});

app.get("/api/scraped-meal/:meal", async (req, res) => {
  const meal = decodeURIComponent(req.params.meal);
  try {
    const data = await loadData();
    let ingredients = (data.scrapedMeals || {})[meal];
    if (!ingredients || ingredients.length === 0) {
      ingredients = MEAL_INGREDIENTS[meal];
    }
    const recipeUrl = (data.scrapedMealUrls || {})[meal];

    if (ingredients && ingredients.length > 0) {
      res.json({ success: true, ingredients, recipeUrl });
    } else {
      res.json({ success: false, ingredients: [], recipeUrl: null });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/save-scraped-meal", async (req, res) => {
  const { mealName, ingredients } = req.body;
  try {
    if (mealName && ingredients && ingredients.length > 0) {
      const data = await loadData();
      if (!data.scrapedMeals) data.scrapedMeals = {};
      data.scrapedMeals[mealName] = ingredients;
      await saveData(data);
      res.json({ success: true });
    } else {
      res.json({ success: false, error: "Missing mealName or ingredients" });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================================
// RECIPE URL SCRAPING
//
// Most recipe sites embed the recipe as schema.org JSON-LD (the same data
// Google reads for recipe cards), which carries the real dish name and a
// clean ingredient array. That's parsed first; the older HTML heuristics only
// run for pages that don't provide it.
// ============================================================================

function decodeHtmlEntities(text) {
  if (!text) return "";
  const named = {
    amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ",
    ndash: "–", mdash: "—", rsquo: "’", lsquo: "‘",
    ldquo: "“", rdquo: "”", frac12: "½", frac14: "¼",
    frac34: "¾", deg: "°",
  };
  const fromCode = (code) => {
    try { return String.fromCodePoint(code); } catch (e) { return ""; }
  };
  return String(text)
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => fromCode(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => fromCode(parseInt(dec, 10)))
    .replace(/&([a-z0-9]+);/gi, (match, name) => (named[name.toLowerCase()] !== undefined ? named[name.toLowerCase()] : match))
    .replace(/\s+/g, " ")
    .trim();
}

function isPrivateHost(hostname) {
  const h = hostname.toLowerCase();
  return (
    h === "localhost" || h === "0.0.0.0" || h === "::1" || h.startsWith("[") ||
    h.endsWith(".local") || h.endsWith(".internal") ||
    /^127\./.test(h) || /^10\./.test(h) || /^192\.168\./.test(h) ||
    /^169\.254\./.test(h) || /^172\.(1[6-9]|2\d|3[01])\./.test(h)
  );
}

function normalizeRecipeUrl(input) {
  let raw = String(input || "").trim();
  if (!raw || /\s/.test(raw)) return null;
  if (!/^https?:\/\//i.test(raw)) raw = "https://" + raw;
  let url;
  try { url = new URL(raw); } catch (e) { return null; }
  if (!["http:", "https:"].includes(url.protocol) || isPrivateHost(url.hostname)) return null;
  return url.toString();
}

function findRecipeNode(html) {
  const blocks = html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi);
  for (const block of blocks) {
    let parsed;
    try { parsed = JSON.parse(block[1].trim()); } catch (e) { continue; }
    const stack = [parsed];
    while (stack.length) {
      const node = stack.pop();
      if (Array.isArray(node)) { stack.push(...node); continue; }
      if (!node || typeof node !== "object") continue;
      const type = node["@type"];
      if (type === "Recipe" || (Array.isArray(type) && type.includes("Recipe"))) return node;
      if (node["@graph"]) stack.push(node["@graph"]);
      if (node.mainEntity) stack.push(node.mainEntity);
    }
  }
  return null;
}

// "Recipe Name - Site Name" / "Recipe Name | Site Name" -> "Recipe Name"
function cleanPageTitle(title) {
  const decoded = decodeHtmlEntities(title.replace(/<[^>]*>/g, " "));
  const parts = decoded.split(/\s+[|–—-]\s+/);
  return (parts.length > 1 ? parts[0] : decoded).trim();
}

function pageTitleFallback(html) {
  const meta =
    html.match(/<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["']/i) ||
    html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:title["']/i);
  if (meta) return cleanPageTitle(meta[1]);
  const h1 = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  if (h1 && cleanPageTitle(h1[1])) return cleanPageTitle(h1[1]);
  const titleTag = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (titleTag) return cleanPageTitle(titleTag[1]);
  return null;
}

// Older, looser extraction for pages without usable JSON-LD.
function scrapeIngredientsHeuristic(html) {
  let ingredients = [];

  const germanMatch = html.match(/Zutaten[\s\S]*?<ul[^>]*>([\s\S]*?)<\/ul>/i);
  if (germanMatch) {
    const liMatches = germanMatch[1].match(/<li[^>]*>([^<]+)<\/li>/gi);
    if (liMatches) ingredients = liMatches.map((m) => m.replace(/<[^>]*>/g, "").trim());
  }

  if (ingredients.length === 0) {
    const divMatches = html.match(/<(?:div|li)[^>]*class="[^"]*ingredient[^"]*"[^>]*>([\s\S]*?)<\/(?:div|li)>/gi);
    if (divMatches) {
      ingredients = divMatches.map((m) => m.replace(/<[^>]*>/g, " ").trim()).filter((i) => i.length > 2);
    }
  }

  if (ingredients.length === 0) {
    const bulletPattern = /[▢☐□✓✔•\-*]\s*([^<\n]*?(?:g|ml|l|EL|TL|cup|Gramm|Liter|Teelöffel|Esslöffel)[^<\n]*)/gi;
    for (const match of html.matchAll(bulletPattern)) {
      const ing = match[1].trim();
      if (ing.length > 3 && ingredients.length < 25) ingredients.push(ing);
    }
  }

  return ingredients
    .map((ing) => decodeHtmlEntities(ing))
    .filter((ing) => ing.length > 2 && ing.length < 150);
}

async function scrapeRecipeFromUrl(rawUrl) {
  const url = normalizeRecipeUrl(rawUrl);
  if (!url) return { success: false, error: "That doesn't look like a valid recipe link" };

  let html;
  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Accept-Language": "en,de;q=0.8",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) return { success: false, url, error: `The recipe site responded with ${response.status}` };
    html = await response.text();
  } catch (err) {
    return { success: false, url, error: err.message };
  }

  let title = null;
  let ingredients = [];

  const recipe = findRecipeNode(html);
  if (recipe) {
    if (typeof recipe.name === "string") title = decodeHtmlEntities(recipe.name);
    const raw = Array.isArray(recipe.recipeIngredient)
      ? recipe.recipeIngredient
      : typeof recipe.recipeIngredient === "string" ? [recipe.recipeIngredient] : [];
    ingredients = raw.map((ing) => decodeHtmlEntities(String(ing))).filter((ing) => ing.length > 1);
  }

  if (!title) title = pageTitleFallback(html);
  if (ingredients.length === 0) ingredients = scrapeIngredientsHeuristic(html);

  const seen = new Set();
  ingredients = ingredients.filter((ing) => {
    const key = ing.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 60);

  return { success: true, url, title: title || null, ingredients };
}

// Readable fallback name from the URL when the page gives us no title.
function titleFromUrlSlug(url) {
  try {
    const parsed = new URL(url);
    const parts = parsed.pathname.split("/").filter(Boolean);
    const slug = decodeURIComponent(parts[parts.length - 1] || parsed.hostname.replace(/^www\./, ""));
    const words = slug
      .replace(/\.[a-z0-9]{2,5}$/i, "")
      .replace(/[-_+]+/g, " ")
      .replace(/\b\d{4,}\b/g, "")
      .replace(/\s+/g, " ")
      .trim();
    return words ? words.charAt(0).toUpperCase() + words.slice(1) : parsed.hostname.replace(/^www\./, "");
  } catch (e) {
    return "Recipe";
  }
}

// Recipe ingredient text ("2 (14-ounce) cans black beans, drained, rinsed")
// boiled down to the item(s) that belong on a shopping list. Amounts and prep
// notes stay in the recipe popup; the list just needs what to buy.
const RECIPE_UNIT_WORDS =
  "cups?|tablespoons?|teaspoons?|tbsp|tsp|tbs|ounces?|oz|pounds?|lbs?|lb|grams?|g|kilograms?|kg|" +
  "milliliters?|ml|liters?|litres?|l|cans?|pinch(?:es)?|dash(?:es)?|handfuls?|slices?|pieces?|sticks?|" +
  "packages?|packs?|bunch(?:es)?|sprigs?|heads?|large|medium|small|whole|ripe|fresh|big";
const RECIPE_NUM = "[\\d\\u00BC-\\u00BE\\u2150-\\u215E]";

// Words that describe how to prepare an ingredient rather than what it is.
const RECIPE_PREP_WORDS = new Set([
  "finely", "roughly", "coarsely", "thinly", "freshly", "peeled", "chopped", "sliced", "diced",
  "minced", "grated", "crushed", "halved", "quartered", "drained", "rinsed", "torn", "shredded",
  "beaten", "melted", "softened", "divided", "cooked", "toasted", "dried",
]);
const RECIPE_PREP_MARKER = /^(?:plus|to serve|to garnish|for serving|for garnish|to taste|to finish|skins? removed|or to taste|finely|roughly|coarsely|thinly|freshly|peeled|chopped|sliced|diced|minced|grated|crushed|halved|quartered|drained|rinsed|torn|shredded|beaten|melted|softened|divided)\b/i;

// "Spanish onion finely chopped" -> "Spanish onion", but leaves
// "finely chopped bell pepper" alone (nothing real comes before the note).
function trimPrepNotes(text) {
  const words = text.split(" ");
  for (let i = 1; i < words.length; i++) {
    if (!RECIPE_PREP_MARKER.test(words.slice(i).join(" "))) continue;
    if (words.slice(0, i).some((w) => !RECIPE_PREP_WORDS.has(w.toLowerCase()))) {
      return words.slice(0, i).join(" ");
    }
  }
  return text;
}

function toShoppingLines(raw) {
  let text = decodeHtmlEntities(raw)
    .replace(/\([^)]*\)/g, " ")
    .split(/[,;]/)[0]
    .split(/\s[-\u2013\u2014]\s/)[0]
    .replace(/\bextra[\s-]virgin\b/gi, "")
    .replace(/\b(garlic)\s+cloves?\b/gi, "$1")
    .replace(/\s+/g, " ")
    .trim();

  const amountRe = new RegExp(
    "^(?:" + RECIPE_NUM + "[\\d\\u00BC-\\u00BE\\u2150-\\u215E/.,\\-\\u2013]*\\s*(?:(?:and|to|or)\\s+" + RECIPE_NUM + "[\\d\\u00BC-\\u00BE\\u2150-\\u215E/.,\\-\\u2013]*\\s*)*)", "i"
  );
  const unitRe = new RegExp("^(?:" + RECIPE_UNIT_WORDS + ")\\b\\.?\\s*", "i");
  for (let i = 0; i < 5; i++) {
    const next = text
      .replace(/^(?:about|approximately|around)\s+/i, "")
      .replace(amountRe, "")
      .replace(unitRe, "")
      .replace(/^of\s+/i, "")
      .trim();
    if (next === text) break;
    text = next;
  }

  // "bread crumbs or oat flour" -> first option; "salt + pepper" -> two items
  return text
    .split(/\s+\+\s+/)
    .map((part) => trimPrepNotes(part.split(/\s+or\s+/i)[0].trim()))
    .filter((part) => part.length > 1)
    .map((part) => translateIngredient(part));
}

function pruneRecipeLines(data) {
  if (!data.recipeShoppingLines) return;
  const active = new Set([...(data.nextWeekMeals || []), ...(data.orderMeals || [])]);
  Object.keys(data.recipeShoppingLines).forEach((meal) => {
    if (!active.has(meal)) delete data.recipeShoppingLines[meal];
  });
}

// Adds a recipe's ingredient lines to New Items and remembers exactly which
// lines this meal is responsible for, so removing the meal later removes only
// those (and never something the user added by hand or another meal needs).
function addRecipeIngredientsToShoppingList(data, meal, cleanLines) {
  if (!data.recipeShoppingLines) data.recipeShoppingLines = {};
  removeRecipeLinesForMeal(data, meal);
  const ownedByOthers = new Set();
  Object.entries(data.recipeShoppingLines).forEach(([otherMeal, lines]) => {
    if (otherMeal !== meal) lines.forEach((line) => ownedByOthers.add(line.toLowerCase()));
  });

  const lines = [];
  const seen = new Set();
  cleanLines.forEach((line) => {
    const key = line.toLowerCase();
    if (!line || seen.has(key)) return;
    seen.add(key);
    if (data.shoppingList.some((i) => i.toLowerCase() === key)) return; // already a baseline item
    const inExtras = data.extraItems.some((i) => i.toLowerCase() === key);
    if (!inExtras) {
      data.extraItems.push(line);
      lines.push(line);
    } else if (ownedByOthers.has(key)) {
      lines.push(line); // shared with another planned recipe
    }
  });
  data.recipeShoppingLines[meal] = lines;
}

function removeRecipeLinesForMeal(data, meal) {
  if (!data.recipeShoppingLines || !data.recipeShoppingLines[meal]) return;
  const lines = data.recipeShoppingLines[meal];
  delete data.recipeShoppingLines[meal];
  pruneRecipeLines(data);
  const stillNeeded = new Set();
  Object.values(data.recipeShoppingLines).forEach((ls) => ls.forEach((l) => stillNeeded.add(l.toLowerCase())));
  const drop = new Set(lines.map((l) => l.toLowerCase()).filter((l) => !stillNeeded.has(l)));
  data.extraItems = data.extraItems.filter((i) => !drop.has(i.toLowerCase()));
}

app.post("/api/scrape-recipe", async (req, res) => {
  const { url } = req.body || {};
  if (!url) return res.json({ success: false, error: "No URL provided" });
  const result = await scrapeRecipeFromUrl(url);
  if (!result.success) return res.json(result);
  res.json({ success: true, title: result.title || "Recipe", ingredients: result.ingredients, count: result.ingredients.length });
});

// Adds a recipe link to Plan Upcoming Week under the dish's real name, with
// its ingredients. `replace` swaps out an existing entry (e.g. a raw URL that
// was saved as the meal name before this existed).
app.post("/api/add-recipe-url", async (req, res) => {
  const { url, replace } = req.body || {};
  try {
    const scraped = await scrapeRecipeFromUrl(url);
    const recipeUrl = scraped.url || normalizeRecipeUrl(url);
    if (!recipeUrl) return res.json({ success: false, error: "That doesn't look like a valid recipe link" });

    const nameFound = !!(scraped.success && scraped.title);
    const title = (nameFound ? scraped.title : titleFromUrlSlug(recipeUrl)).slice(0, 120);
    // Just the items - no amounts or prep notes - in German, deduplicated.
    const seenLines = new Set();
    const ingredients = (scraped.success ? scraped.ingredients : [])
      .flatMap((raw) => toShoppingLines(raw))
      .filter((line) => {
        const key = line.toLowerCase();
        if (!line || seenLines.has(key)) return false;
        seenLines.add(key);
        return true;
      });

    // Load after the (slow) scrape so we never write back stale data.
    const data = await loadData();
    if (!data.nextWeekMeals) data.nextWeekMeals = [];
    if (!data.scrapedMeals) data.scrapedMeals = {};
    if (!data.scrapedMealUrls) data.scrapedMealUrls = {};

    const list = data.nextWeekMeals;
    const replaceIdx = replace ? list.indexOf(replace) : -1;
    if (replaceIdx !== -1) {
      if (list.includes(title) && list[replaceIdx] !== title) list.splice(replaceIdx, 1);
      else list[replaceIdx] = title;
    } else if (!list.includes(title)) {
      list.push(title);
    }

    data.scrapedMealUrls[title] = recipeUrl;
    if (ingredients.length > 0) data.scrapedMeals[title] = ingredients;
    if (replace && replace !== title) {
      removeRecipeLinesForMeal(data, replace);
      delete data.scrapedMeals[replace];
      delete data.scrapedMealUrls[replace];
    }
    if (ingredients.length > 0) addRecipeIngredientsToShoppingList(data, title, ingredients);

    await saveData(data);
    res.json({ success: true, data, title, nameFound, ingredientCount: ingredients.length });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Renames a meal everywhere it's keyed by name.
app.post("/api/rename-meal", async (req, res) => {
  const oldName = String(req.body?.oldName ?? "");
  const newName = String(req.body?.newName ?? "").replace(/\s+/g, " ").trim().slice(0, 120);
  if (!oldName || !newName) return res.json({ success: false, error: "The name can't be empty" });

  try {
    const data = await loadData();
    const listKeys = ["orderMeals", "nextWeekMeals", "classics", "cookedMeals"];
    const mapKeys = ["scrapedMeals", "scrapedMealUrls", "recipeShoppingLines"];
    const exists =
      listKeys.some((k) => (data[k] || []).includes(oldName)) ||
      mapKeys.some((k) => data[k] && Object.prototype.hasOwnProperty.call(data[k], oldName));
    if (!exists) return res.json({ success: false, error: "Meal not found" });

    if (newName !== oldName) {
      listKeys.forEach((k) => {
        const arr = data[k];
        if (!Array.isArray(arr)) return;
        const idx = arr.indexOf(oldName);
        if (idx === -1) return;
        if (arr.includes(newName)) arr.splice(idx, 1);
        else arr[idx] = newName;
      });
      mapKeys.forEach((k) => {
        const obj = data[k];
        if (!obj || !Object.prototype.hasOwnProperty.call(obj, oldName)) return;
        if (!Object.prototype.hasOwnProperty.call(obj, newName)) obj[newName] = obj[oldName];
        delete obj[oldName];
      });
      await saveData(data);
    }
    res.json({ success: true, data, name: newName });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ============================================================================
// MEAL GENERATION (TheMealDB + Spoonacular)
// ============================================================================

const SPOONACULAR_KEY = process.env.SPOONACULAR_API_KEY;

// TheMealDB's search.php response already carries strIngredient1..20 /
// strMeasure1..20 pairs - no need to scrape the source URL's HTML for
// something the API handed us directly.
function extractTheMealDbIngredients(mealDetail) {
  const ingredients = [];
  for (let i = 1; i <= 20; i++) {
    const ingredient = (mealDetail[`strIngredient${i}`] || "").trim();
    const measure = (mealDetail[`strMeasure${i}`] || "").trim();
    if (ingredient) {
      ingredients.push(measure ? `${measure} ${ingredient}` : ingredient);
    }
  }
  return ingredients;
}

async function fetchExternalSuggestions() {
  const data = await loadData();
  if (!data.scrapedMealUrls) data.scrapedMealUrls = {};
  if (!data.scrapedMeals) data.scrapedMeals = {};

  const otherSuggestions = [];
  const mealNames = new Set();

  // Only counts toward its target, and only enters suggestions, once we've
  // actually confirmed ingredient data exists for it - otherwise the user
  // clicks a suggestion and finds an empty ingredients list.
  function acceptMeal(mealName, sourceUrl, ingredients) {
    if (mealNames.has(mealName) || !ingredients || ingredients.length === 0) return false;
    mealNames.add(mealName);
    otherSuggestions.push(mealName);
    if (sourceUrl) data.scrapedMealUrls[mealName] = sourceUrl;
    data.scrapedMeals[mealName] = ingredients;
    return true;
  }

  const vegetarianTarget = 14;
  let vegCount = 0;

  for (let i = 0; i < 12 && vegCount < vegetarianTarget; i++) {
    try {
      const vegResponse = await fetch('https://www.themealdb.com/api/json/v1/1/filter.php?c=Vegetarian');
      const vegData = await vegResponse.json();
      if (vegData.meals && vegData.meals.length > 0) {
        const randomMeal = vegData.meals[Math.floor(Math.random() * vegData.meals.length)];
        const mealName = randomMeal.strMeal;
        if (!mealNames.has(mealName)) {
          const detailResponse = await fetch(`https://www.themealdb.com/api/json/v1/1/search.php?s=${encodeURIComponent(mealName)}`);
          const detailData = await detailResponse.json();
          const detail = detailData.meals && detailData.meals[0];
          if (detail && acceptMeal(mealName, detail.strSource, extractTheMealDbIngredients(detail))) {
            vegCount++;
          }
        }
      }
    } catch (e) { console.log('Error fetching TheMealDB vegetarian:', e.message); }
  }

  for (let i = 0; i < 12 && vegCount < vegetarianTarget; i++) {
    try {
      const spoonResponse = await fetch(`https://api.spoonacular.com/recipes/complexSearch?diet=vegetarian&number=1&addRecipeInformation=true&fillIngredients=true&apiKey=${SPOONACULAR_KEY}&offset=${Math.floor(Math.random() * 50)}`);
      const spoonData = await spoonResponse.json();
      if (spoonData.results && spoonData.results.length > 0) {
        const recipe = spoonData.results[0];
        const ingredients = (recipe.extendedIngredients || []).map((i) => i.original).filter(Boolean);
        if (acceptMeal(recipe.title, recipe.sourceUrl, ingredients)) {
          vegCount++;
        }
      }
    } catch (e) { console.log('Error fetching Spoonacular vegetarian:', e.message); }
  }

  const meatTarget = 6;
  let meatCount = 0;
  const meatCategories = ['Chicken', 'Beef', 'Seafood'];

  for (let i = 0; i < 6 && meatCount < meatTarget; i++) {
    try {
      const meatCategory = meatCategories[i % meatCategories.length];
      const meatResponse = await fetch(`https://www.themealdb.com/api/json/v1/1/filter.php?c=${meatCategory}`);
      const meatData = await meatResponse.json();
      if (meatData.meals && meatData.meals.length > 0) {
        const randomMeal = meatData.meals[Math.floor(Math.random() * meatData.meals.length)];
        const mealName = randomMeal.strMeal;
        if (!mealNames.has(mealName)) {
          const detailResponse = await fetch(`https://www.themealdb.com/api/json/v1/1/search.php?s=${encodeURIComponent(mealName)}`);
          const detailData = await detailResponse.json();
          const detail = detailData.meals && detailData.meals[0];
          if (detail && acceptMeal(mealName, detail.strSource, extractTheMealDbIngredients(detail))) {
            meatCount++;
          }
        }
      }
    } catch (e) { console.log('Error fetching TheMealDB meat:', e.message); }
  }

  for (let i = 0; i < 6 && meatCount < meatTarget; i++) {
    try {
      const spoonResponse = await fetch(`https://api.spoonacular.com/recipes/complexSearch?type=main%20course&number=1&addRecipeInformation=true&fillIngredients=true&apiKey=${SPOONACULAR_KEY}&offset=${Math.floor(Math.random() * 50)}`);
      const spoonData = await spoonResponse.json();
      if (spoonData.results && spoonData.results.length > 0) {
        const recipe = spoonData.results[0];
        const ingredients = (recipe.extendedIngredients || []).map((i) => i.original).filter(Boolean);
        if (acceptMeal(recipe.title, recipe.sourceUrl, ingredients)) {
          meatCount++;
        }
      }
    } catch (e) { console.log('Error fetching Spoonacular meat:', e.message); }
  }

  otherSuggestions.sort(() => Math.random() - 0.5);

  const suggestionsWithUrls = otherSuggestions.slice(0, 20).map(meal => ({
    name: meal,
    url: data.scrapedMealUrls[meal] || null,
  }));

  await saveData(data);
  return suggestionsWithUrls;
}

app.post("/api/generate-week", async (req, res) => {
  const classicSuggestions = [...CLASSICS].sort(() => Math.random() - 0.5).slice(0, 2);
  try {
    const suggestionsWithUrls = await fetchExternalSuggestions();
    res.json({ classics: classicSuggestions, suggestions: suggestionsWithUrls });
  } catch (error) {
    console.error('Error fetching recipes:', error);
    const otherSuggestions = [...SUGGESTIONS].sort(() => Math.random() - 0.5).slice(0, 20);
    res.json({ classics: classicSuggestions, suggestions: otherSuggestions });
  }
});

app.post("/api/generate-classics", (req, res) => {
  const shuffled = [...CLASSICS];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  res.json({ classics: shuffled.slice(0, 2) });
});

app.post("/api/generate-suggestions", async (req, res) => {
  try {
    const suggestionsWithUrls = await fetchExternalSuggestions();
    res.json({ suggestions: suggestionsWithUrls });
  } catch (error) {
    console.error('Error generating suggestions:', error);
    const otherSuggestions = [...SUGGESTIONS].sort(() => Math.random() - 0.5).slice(0, 20);
    res.json({ suggestions: otherSuggestions });
  }
});

// ============================================================================
// PICNIC
//
// Serverless functions have no shared memory between invocations and a hard
// execution time limit, which is why this can't just be a straight port of
// the always-on local server's version (which keeps the authenticated
// client and any in-progress sync in a plain in-memory variable, and runs
// the whole cart-add loop in one long request). Instead:
//   - The Picnic auth key (a plain string picnic-api hands back after login
//     / after 2FA) is persisted in Supabase and used to reconstruct a fresh
//     PicnicClient on every request - no server process needs to stay up.
//   - The cart-sync loop is processed in small chunks. Each request handles
//     PICNIC_SYNC_CHUNK_SIZE items and returns; the frontend calls
//     /api/picnic-sync-continue in a loop until done, so no single request
//     risks the platform's execution time limit.
// ============================================================================

const PICNIC_SYNC_CHUNK_SIZE = 6;

function makePicnicClient(authKey) {
  return new PicnicClient({ countryCode: "DE", authKey: authKey || undefined });
}

function serializePurchaseHistory(map) {
  return Array.from(map.entries()).map(([key, article]) => ({ key, article }));
}

function deserializePurchaseHistory(arr) {
  const map = new Map();
  (arr || []).forEach(({ key, article }) => map.set(key, article));
  return map;
}

async function loadPicnicPurchaseHistory(client) {
  const purchaseHistory = new Map();
  try {
    const deliveries = await client.delivery.getDeliveries();
    if (deliveries && deliveries.length > 0) {
      for (const delivery of deliveries.slice(0, 5)) {
        try {
          const detail = await client.delivery.getDelivery(delivery.delivery_id);
          if (detail && detail.orders) {
            for (const order of detail.orders) {
              if (order.items) {
                for (const orderLine of order.items) {
                  if (orderLine.items && Array.isArray(orderLine.items)) {
                    for (const article of orderLine.items) {
                      const key = (article.name || "").toLowerCase();
                      if (key) purchaseHistory.set(key, article);
                    }
                  }
                }
              }
            }
          }
        } catch (err) {
          // Skip this delivery's detail, keep whatever else we've collected.
        }
      }
    }
  } catch (err) {
    // No history available - smart search still works via search fallbacks.
  }
  return purchaseHistory;
}

// Fetch delivery costs and save them in the same {date, amount} shape
// /api/combined-costs already knows how to aggregate.
async function savePicnicDeliveryCosts(client, data) {
  try {
    const deliveries = await client.delivery.getDeliveries();
    if (deliveries && deliveries.length > 0) {
      data.picnicCosts = deliveries.map((d) => ({
        date: new Date(d.delivery_time?.start || d.delivery_date).toISOString(),
        amount:
          d.orders && d.orders[0]?.total_price
            ? parseFloat((d.orders[0].total_price / 100).toFixed(2))
            : d.amount
            ? parseFloat(d.amount)
            : 0,
      }));
    }
  } catch (err) {
    // Leave existing picnicCosts untouched if this fails.
  }
}

// Processes up to PICNIC_SYNC_CHUNK_SIZE items from session.remaining,
// mutating session in place. Returns true once nothing is left.
async function processPicnicChunk(client, session) {
  const items = session.remaining.splice(0, PICNIC_SYNC_CHUNK_SIZE);
  const purchaseHistory = deserializePurchaseHistory(session.purchaseHistory);

  for (const item of items) {
    try {
      const match = await smartProductSearch(client, item, purchaseHistory, selectBestProduct);
      if (!match) {
        session.failedItems.push(item);
      } else {
        await client.cart.addProductToCart(match.product.id, 1);
        session.addedItems.push(item);
      }
    } catch (err) {
      session.failedItems.push(item);
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
  }

  return session.remaining.length === 0;
}

app.post("/api/picnic-start-sync", async (req, res) => {
  try {
    const data = await loadData();
    let { username, password, mode } = req.body || {};
    // Costs and purchase history always refresh together; only the
    // "Auto-Add to Picnic" button should actually touch the cart.
    const shouldSyncCart = mode === "picnic";

    if (!username || !password) {
      if (data.picnicCredentials?.username && data.picnicCredentials?.password) {
        username = data.picnicCredentials.username;
        password = data.picnicCredentials.password;
      } else {
        return res.json({ success: false, error: "No credentials provided or saved" });
      }
    }

    const groceryList = itemsToOrder(data);
    if (shouldSyncCart && groceryList.length === 0) {
      const anyListed = (data.shoppingList || []).length + (data.extraItems || []).length > 0;
      return res.json({
        success: false,
        error: anyListed ? "Every item is set to 0, so there is nothing to add" : "Shopping list is empty",
      });
    }

    const client = makePicnicClient();
    const loginResponse = await client.auth.login(username, password);

    if (loginResponse.second_factor_authentication_required) {
      await client.auth.generate2FACode("SMS");
      data.picnicSyncSession = {
        status: "pending_2fa",
        pendingAuthKey: client.authKey,
        shouldSyncCart,
        remaining: groceryList,
        addedItems: [],
        failedItems: [],
        purchaseHistory: [],
        createdAt: new Date().toISOString(),
      };
      await saveData(data);
      return res.json({ success: true, requires2FA: true, sessionId: "picnic" });
    }

    // No 2FA required (rare) - log in and process the first chunk right away.
    data.picnicAuthKey = client.authKey;
    await savePicnicDeliveryCosts(client, data);
    const purchaseHistory = await loadPicnicPurchaseHistory(client);
    data.picnicPurchaseHistoryProducts = Array.from(purchaseHistory.values()).map((a) => ({
      name: a.name,
      brand: a.brand,
      price: a.price,
    }));

    if (!shouldSyncCart) {
      data.picnicSyncSession = null;
      await saveData(data);
      return res.json({
        success: true,
        requires2FA: false,
        cartSyncSkipped: true,
        done: true,
        addedItems: [],
        failedItems: [],
        remainingCount: 0,
      });
    }

    await client.cart.clearCart();
    const session = {
      remaining: groceryList,
      addedItems: [],
      failedItems: [],
      purchaseHistory: serializePurchaseHistory(purchaseHistory),
    };
    const done = await processPicnicChunk(client, session);
    data.picnicSyncSession = done ? null : { status: "syncing", ...session };
    await saveData(data);

    res.json({
      success: true,
      requires2FA: false,
      cartSyncSkipped: false,
      done,
      addedItems: session.addedItems,
      failedItems: session.failedItems,
      remainingCount: session.remaining.length,
    });
  } catch (error) {
    res.json({ success: false, error: error.message });
  }
});

app.post("/api/picnic-verify-2fa", async (req, res) => {
  const { code } = req.body || {};
  if (!code) return res.json({ success: false, error: "Missing code" });

  try {
    const data = await loadData();
    const pending = data.picnicSyncSession;
    if (!pending || pending.status !== "pending_2fa") {
      return res.json({ success: false, error: "No pending Picnic login. Please try again." });
    }

    const client = makePicnicClient(pending.pendingAuthKey);
    await client.auth.verify2FACode(code);
    data.picnicAuthKey = client.authKey;

    await savePicnicDeliveryCosts(client, data);
    const purchaseHistory = await loadPicnicPurchaseHistory(client);
    data.picnicPurchaseHistoryProducts = Array.from(purchaseHistory.values()).map((a) => ({
      name: a.name,
      brand: a.brand,
      price: a.price,
    }));

    if (!pending.shouldSyncCart) {
      data.picnicSyncSession = null;
      await saveData(data);
      return res.json({
        success: true,
        requires2FA: false,
        cartSyncSkipped: true,
        done: true,
        addedItems: [],
        failedItems: [],
        remainingCount: 0,
      });
    }

    await client.cart.clearCart();
    const session = {
      remaining: pending.remaining,
      addedItems: [],
      failedItems: [],
      purchaseHistory: serializePurchaseHistory(purchaseHistory),
    };
    const done = await processPicnicChunk(client, session);
    data.picnicSyncSession = done ? null : { status: "syncing", ...session };
    await saveData(data);

    res.json({
      success: true,
      requires2FA: false,
      cartSyncSkipped: false,
      done,
      addedItems: session.addedItems,
      failedItems: session.failedItems,
      remainingCount: session.remaining.length,
    });
  } catch (error) {
    res.json({ success: false, error: error.message });
  }
});

// Called in a loop by the frontend after picnic-verify-2fa until done:true.
// No body needed - resumes from the session + auth key already saved.
app.post("/api/picnic-sync-continue", async (req, res) => {
  try {
    const data = await loadData();
    const session = data.picnicSyncSession;
    if (!session || session.status !== "syncing" || !data.picnicAuthKey) {
      return res.json({ success: false, error: "No sync in progress" });
    }

    const client = makePicnicClient(data.picnicAuthKey);
    const working = {
      remaining: session.remaining,
      addedItems: session.addedItems,
      failedItems: session.failedItems,
      purchaseHistory: session.purchaseHistory,
    };
    const done = await processPicnicChunk(client, working);
    data.picnicSyncSession = done ? null : { status: "syncing", ...working };
    await saveData(data);

    res.json({
      success: true,
      done,
      addedItems: working.addedItems,
      failedItems: working.failedItems,
      remainingCount: working.remaining.length,
    });
  } catch (error) {
    res.json({ success: false, error: error.message });
  }
});

app.post("/api/save-picnic-credentials", async (req, res) => {
  try {
    const { username, password } = req.body || {};
    if (!username || !password) {
      return res.json({ success: false, error: "Missing username or password" });
    }
    const data = await loadData();
    data.picnicCredentials = { username, password };
    await saveData(data);
    res.json({ success: true });
  } catch (error) {
    res.json({ success: false, error: error.message });
  }
});

app.post("/api/purchase-history-auth", (req, res) => {
  res.json({ success: false, error: "Not implemented - use Load Purchase History from the Shopping tab" });
});

app.post("/api/purchase-history-verify-2fa", (req, res) => {
  res.json({ success: false, error: "Not implemented - use Load Purchase History from the Shopping tab" });
});

app.get("/api/purchase-history-cached", async (req, res) => {
  const data = await loadData();
  res.json({ success: true, products: data.picnicPurchaseHistoryProducts || [] });
});

// ============================================================================
// HEALTH
// ============================================================================

app.get("/api/health", (req, res) => {
  res.json({ status: "ok" });
});

// Initialize and export for Vercel
initializeDatabase();

module.exports = app;
