const express = require("express");
const { createClient } = require("@supabase/supabase-js");
const cron = require("node-cron");

const app = express();

// Supabase setup
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

// Login password
const LOGIN_PASSWORD = "neel";

app.use(express.json({ limit: "10mb" }));
app.use(express.static("meal-hub-public"));

// Initialize database tables on startup
async function initializeDatabase() {
  try {
    // Check if meals table exists, if not create it
    const { data: existing } = await supabase
      .from("meals")
      .select("id")
      .limit(1);

    if (!existing) {
      await supabase.from("meals").insert([{
        id: "main",
        data: { weeks: [], lastRefresh: null, mealBackups: [], logEntries: [] }
      }]);
    }
  } catch (err) {
    console.log("Database tables ready or already exist");
  }
}

// Load data from Supabase
async function loadData() {
  try {
    const { data, error } = await supabase
      .from("meals")
      .select("data")
      .eq("id", "main")
      .single();

    if (error) throw error;
    return data?.data || getDefaultData();
  } catch (err) {
    console.error("Error loading data:", err);
    return getDefaultData();
  }
}

// Save data to Supabase
async function saveData(data) {
  try {
    await supabase
      .from("meals")
      .update({ data })
      .eq("id", "main");
  } catch (err) {
    console.error("Error saving data:", err);
  }
}

function getDefaultData() {
  return {
    weeks: [],
    lastRefresh: null,
    mealBackups: [],
    logEntries: []
  };
}

// Login endpoint
app.post("/api/login", (req, res) => {
  const { password } = req.body;
  if (password === LOGIN_PASSWORD) {
    res.json({ success: true });
  } else {
    res.status(401).json({ success: false, error: "Invalid password" });
  }
});

// Update weekly menu
app.post("/api/update-weekly-menu", async (req, res) => {
  const { meals } = req.body;

  if (!Array.isArray(meals)) {
    return res.json({ success: false, error: "Invalid meals data" });
  }

  try {
    const data = await loadData();
    data.weeks = [{ meals, date: new Date().toISOString() }, ...(data.weeks || []).slice(0, 11)];
    await saveData(data);
    res.json({ success: true });
  } catch (err) {
    console.error("Error:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Get current meals
app.get("/api/get-meals", async (req, res) => {
  try {
    const data = await loadData();
    const currentWeek = data.weeks?.[0] || {};
    res.json({ meals: currentWeek.meals || [] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Shopping list endpoints
app.get("/api/shopping-list", async (req, res) => {
  try {
    const data = await loadData();
    res.json({ items: data.shoppingItems || [] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/update-shopping-list", async (req, res) => {
  const { items } = req.body;
  try {
    const data = await loadData();
    data.shoppingItems = items;
    await saveData(data);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Picnic API endpoints (simplified - no real Picnic integration for now)
app.post("/api/picnic-start-sync", (req, res) => {
  res.json({ success: false, error: "Picnic sync temporarily disabled during migration" });
});

app.post("/api/picnic-verify-2fa", (req, res) => {
  res.json({ success: false, error: "Picnic sync temporarily disabled during migration" });
});

// Get all data
app.get("/api/data", async (req, res) => {
  try {
    const data = await loadData();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Save all data
app.post("/api/data", async (req, res) => {
  try {
    await saveData(req.body);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Health check
app.get("/api/health", (req, res) => {
  res.json({ status: "ok" });
});

// Initialize and export for Vercel
initializeDatabase();

module.exports = app;
