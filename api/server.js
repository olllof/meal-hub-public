const express = require("express");
const crypto = require("crypto");
const path = require("path");
const { createClient } = require("@supabase/supabase-js");

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
    classics: [...CLASSICS],
    cookedMeals: [],
    receipts: [],
    picnicCosts: [],
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
  const quantityPattern = /\b(\d+[\d\s.\/\-xX]*(?:tbsp|tsp|g|ml|l|kg|oz|cup|cups|lbs?|lb)|(?:tbsp|tsp|g|ml|l|kg|oz|cup|cups|lbs?|lb)\b)/gi;
  let match;
  while ((match = quantityPattern.exec(ingredient)) !== null) {
    quantities.push(match[0].trim());
  }

  let cleanedText = ingredient;
  cleanedText = cleanedText.replace(/\b(\d+[\d\s.\/\-xX]*(?:tbsp|tsp|g|ml|l|kg|oz|cup|cups|lbs?|lb)|(?:tbsp|tsp|g|ml|l|kg|oz|cup|cups|lbs?|lb)\b)/gi, ' ').trim();

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
      const ingLower = ing.toLowerCase();
      if (!map[ingLower]) map[ingLower] = [];
      if (!map[ingLower].includes(meal)) map[ingLower].push(meal);
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
    data.lastWeeklyRefresh = new Date().toISOString();
    syncShoppingListWithMeals(data);
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

app.post("/api/shopping", async (req, res) => {
  let { action, item, oldName } = req.body;
  try {
    const data = await loadData();

    if (action === "rename") {
      const newItem = translateIngredient(item);

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
        item = translateIngredient(item);
      }

      if (action === "add" && !data.shoppingList.includes(item) && !data.extraItems.includes(item)) {
        data.extraItems.unshift(item);
      } else if (action === "remove") {
        data.shoppingList = data.shoppingList.filter((i) => i !== item);
        data.extraItems = data.extraItems.filter((i) => i !== item);
      } else if (action === "toggle-have") {
        data.shoppingList = data.shoppingList.filter((i) => i !== item);
        data.extraItems = data.extraItems.filter((i) => i !== item);
      } else if (action === "promote-to-baseline") {
        data.extraItems = data.extraItems.filter((i) => i !== item);
        if (!data.shoppingList.includes(item)) data.shoppingList.push(item);
      } else if (action === "remove-from-baseline") {
        data.shoppingList = data.shoppingList.filter((i) => i !== item);
        if (!data.extraItems.includes(item)) data.extraItems.unshift(item);
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

app.post("/api/scrape-recipe", async (req, res) => {
  const { url } = req.body;
  if (!url) return res.json({ success: false, error: "No URL provided" });

  try {
    const response = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
    });
    const html = await response.text();

    let title = "Recipe";
    const h1Match = html.match(/<h1[^>]*>([^<]+)<\/h1>/i);
    const metaTitleMatch = html.match(/<meta[^>]*property="og:title"[^>]*content="([^"]+)"/i);
    if (h1Match) title = h1Match[1].trim();
    else if (metaTitleMatch) title = metaTitleMatch[1].trim();

    let ingredients = [];

    const jsonLdMatches = html.matchAll(/"recipeIngredient"\s*:\s*"([^"]+)"/gi);
    for (const match of jsonLdMatches) ingredients.push(match[1].trim());

    if (ingredients.length === 0) {
      const jsonLdArrayMatch = html.match(/"recipeIngredient"\s*:\s*\[([\s\S]*?)\]/);
      if (jsonLdArrayMatch) {
        const ingMatches = jsonLdArrayMatch[1].matchAll(/"([^"]+)"/g);
        for (const match of ingMatches) ingredients.push(match[1].trim());
      }
    }

    if (ingredients.length === 0) {
      const germanMatch = html.match(/Zutaten[\s\S]*?<ul[^>]*>([\s\S]*?)<\/ul>/i);
      if (germanMatch) {
        const liMatches = germanMatch[1].match(/<li[^>]*>([^<]+)<\/li>/gi);
        if (liMatches) ingredients = liMatches.map((m) => m.replace(/<[^>]*>/g, "").trim());
      }
    }

    if (ingredients.length === 0) {
      const divMatches = html.match(/<div[^>]*class="[^"]*ingredient[^"]*"[^>]*>([\s\S]*?)<\/div>/gi);
      if (divMatches) {
        ingredients = divMatches.map((m) => m.replace(/<[^>]*>/g, "").trim()).filter(i => i.length > 2);
      }
    }

    if (ingredients.length === 0) {
      const bulletPattern = /[▢☐□✓✔•\-*]\s*([^<\n]*?(?:g|ml|l|EL|TL|cup|Gramm|Liter|Teelöffel|Esslöffel)[^<\n]*)/gi;
      const matches = html.matchAll(bulletPattern);
      for (const match of matches) {
        const ing = match[1].trim().replace(/^\s*-\s*/, "").trim();
        if (ing.length > 3 && ingredients.length < 25) ingredients.push(ing);
      }
    }

    if (ingredients.length === 0) {
      const text = html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ");
      const ingredientPattern = /(\d+[\s\-]*(?:g|ml|l|cup|tbsp|tsp|oz|lb|kg|dl|cl|EL|TL|Gramm|Liter|Tasse|Esslöffel|Teelöffel)[^,.]*?[\w\s]+(?:,|\.|\n|$))/gi;
      const matches = text.matchAll(ingredientPattern);
      for (const match of matches) {
        const ing = match[1].trim().replace(/[,.\n]*$/, "").trim();
        if (ing.length > 3 && ingredients.length < 20) ingredients.push(ing);
      }
    }

    ingredients = Array.from(new Set(
      ingredients
        .map((ing) => ing.replace(/^[\d\s\-–•*\(\)\[\]]+/, "").replace(/\(optional\)/i, "").replace(/^[–—-]+/, "").trim())
        .filter((ing) => ing.length > 2 && ing.length < 150)
    )).slice(0, 15);

    res.json({ success: true, title, ingredients, count: ingredients.length });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

// ============================================================================
// MEAL GENERATION (TheMealDB + Spoonacular)
// ============================================================================

const SPOONACULAR_KEY = process.env.SPOONACULAR_API_KEY;

async function fetchExternalSuggestions() {
  const data = await loadData();
  if (!data.scrapedMealUrls) data.scrapedMealUrls = {};

  const otherSuggestions = [];
  const mealNames = new Set();

  const vegetarianTarget = 14;
  let vegCount = 0;

  for (let i = 0; i < 7 && vegCount < vegetarianTarget; i++) {
    try {
      const vegResponse = await fetch('https://www.themealdb.com/api/json/v1/1/filter.php?c=Vegetarian');
      const vegData = await vegResponse.json();
      if (vegData.meals && vegData.meals.length > 0) {
        const randomMeal = vegData.meals[Math.floor(Math.random() * vegData.meals.length)];
        const mealName = randomMeal.strMeal;
        if (!mealNames.has(mealName)) {
          otherSuggestions.push(mealName);
          mealNames.add(mealName);
          vegCount++;
          const detailResponse = await fetch(`https://www.themealdb.com/api/json/v1/1/search.php?s=${encodeURIComponent(mealName)}`);
          const detailData = await detailResponse.json();
          if (detailData.meals && detailData.meals[0].strSource) {
            data.scrapedMealUrls[mealName] = detailData.meals[0].strSource;
          }
        }
      }
    } catch (e) { console.log('Error fetching TheMealDB vegetarian:', e.message); }
  }

  for (let i = 0; i < 7 && vegCount < vegetarianTarget; i++) {
    try {
      const spoonResponse = await fetch(`https://api.spoonacular.com/recipes/complexSearch?diet=vegetarian&number=1&apiKey=${SPOONACULAR_KEY}&offset=${Math.floor(Math.random() * 50)}`);
      const spoonData = await spoonResponse.json();
      if (spoonData.results && spoonData.results.length > 0) {
        const recipe = spoonData.results[0];
        const mealName = recipe.title;
        const sourceUrl = recipe.sourceUrl;
        if (!mealNames.has(mealName)) {
          otherSuggestions.push(mealName);
          mealNames.add(mealName);
          vegCount++;
          if (sourceUrl) data.scrapedMealUrls[mealName] = sourceUrl;
        }
      }
    } catch (e) { console.log('Error fetching Spoonacular vegetarian:', e.message); }
  }

  const meatTarget = 6;
  let meatCount = 0;
  const meatCategories = ['Chicken', 'Beef', 'Seafood'];

  for (let i = 0; i < 3 && meatCount < meatTarget; i++) {
    try {
      const meatCategory = meatCategories[i % meatCategories.length];
      const meatResponse = await fetch(`https://www.themealdb.com/api/json/v1/1/filter.php?c=${meatCategory}`);
      const meatData = await meatResponse.json();
      if (meatData.meals && meatData.meals.length > 0) {
        const randomMeal = meatData.meals[Math.floor(Math.random() * meatData.meals.length)];
        const mealName = randomMeal.strMeal;
        if (!mealNames.has(mealName)) {
          otherSuggestions.push(mealName);
          mealNames.add(mealName);
          meatCount++;
          const detailResponse = await fetch(`https://www.themealdb.com/api/json/v1/1/search.php?s=${encodeURIComponent(mealName)}`);
          const detailData = await detailResponse.json();
          if (detailData.meals && detailData.meals[0].strSource) {
            data.scrapedMealUrls[mealName] = detailData.meals[0].strSource;
          }
        }
      }
    } catch (e) { console.log('Error fetching TheMealDB meat:', e.message); }
  }

  for (let i = 0; i < 3 && meatCount < meatTarget; i++) {
    try {
      const spoonResponse = await fetch(`https://api.spoonacular.com/recipes/complexSearch?type=main%20course&number=1&apiKey=${SPOONACULAR_KEY}&offset=${Math.floor(Math.random() * 50)}`);
      const spoonData = await spoonResponse.json();
      if (spoonData.results && spoonData.results.length > 0) {
        const recipe = spoonData.results[0];
        const mealName = recipe.title;
        const sourceUrl = recipe.sourceUrl;
        if (!mealNames.has(mealName)) {
          otherSuggestions.push(mealName);
          mealNames.add(mealName);
          meatCount++;
          if (sourceUrl) data.scrapedMealUrls[mealName] = sourceUrl;
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
// PICNIC (disabled during migration)
// ============================================================================

app.post("/api/picnic-start-sync", (req, res) => {
  res.json({ success: false, error: "Picnic sync temporarily disabled during migration" });
});

app.post("/api/picnic-verify-2fa", (req, res) => {
  res.json({ success: false, error: "Picnic sync temporarily disabled during migration" });
});

app.post("/api/save-picnic-credentials", (req, res) => {
  res.json({ success: false, error: "Picnic sync temporarily disabled during migration" });
});

app.post("/api/purchase-history-auth", (req, res) => {
  res.json({ success: false, error: "Picnic sync temporarily disabled during migration" });
});

app.post("/api/purchase-history-verify-2fa", (req, res) => {
  res.json({ success: false, error: "Picnic sync temporarily disabled during migration" });
});

app.get("/api/purchase-history-cached", async (req, res) => {
  res.json({ success: true, history: [] });
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
