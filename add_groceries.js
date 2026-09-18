#!/usr/bin/env node

/**
 * Picnic Grocery Automation Script (Node.js)
 * Uses the official picnic-api package to automate adding items to cart
 */

const PicnicClient = require("picnic-api");
const readline = require("readline");
const { smartProductSearch } = require("./picnic-search.js");

// Grocery list - will be fetched from server if available
let GROCERY_LIST = [];

class PicnicAutomation {
  constructor(username, password) {
    this.username = username;
    this.password = password;
    this.client = new PicnicClient({ countryCode: "DE" });
    this.addedItems = [];
    this.failedItems = [];
    this.purchaseHistory = new Map(); // productName -> product object
  }

  async loadPurchaseHistory() {
    try {
      console.log("📜 Loading your purchase history...");
      // Get user's deliveries
      const deliveries = await this.client.delivery.getDeliveries();

      if (deliveries && deliveries.length > 0) {
        // Extract products from recent deliveries
        for (const delivery of deliveries.slice(0, 5)) {
          // Last 5 deliveries
          if (delivery.orders) {
            for (const order of delivery.orders) {
              if (order.products) {
                for (const product of order.products) {
                  const key = (product.name || "").toLowerCase();
                  this.purchaseHistory.set(key, product);
                }
              }
            }
          }
        }
        console.log(
          `✅ Loaded ${this.purchaseHistory.size} products from history\n`
        );
      }
    } catch (error) {
      console.log("⚠️  Could not load purchase history (continuing anyway)\n");
    }
  }

  async clearCart() {
    try {
      console.log("🗑️  Clearing cart...");
      await this.client.cart.clearCart();
      console.log("✅ Cart cleared\n");
      return true;
    } catch (error) {
      console.log("⚠️  Could not clear cart (continuing anyway)\n");
      return false;
    }
  }

  async login() {
    try {
      console.log("🔐 Logging in to Picnic...");
      const loginResponse = await this.client.auth.login(this.username, this.password);

      // Check if 2FA is required
      if (loginResponse.second_factor_authentication_required) {
        console.log("📱 2FA required. Requesting code via SMS...");

        try {
          // Generate 2FA code (send SMS)
          await this.client.auth.generate2FACode("SMS");
          console.log("✅ SMS sent! Check your phone for the code.\n");

          // Ask user for the code
          const code = await askQuestion("Enter your 6-digit SMS code: ");

          // Verify the code
          await this.client.auth.verify2FACode(code);
          console.log("✅ 2FA verified! Logged in.\n");
          return true;
        } catch (verifyError) {
          console.error("❌ 2FA failed:", verifyError.message);
          return false;
        }
      } else {
        console.log("✅ Login successful!\n");
        return true;
      }
    } catch (error) {
      console.error("❌ Login failed:", error.message);
      return false;
    }
  }

  selectBestProduct(results, itemName) {
    if (!results || results.length === 0) return null;

    // Score products by criteria
    let scored = results.map((product) => {
      let score = 0;
      const name = (product.name || "").toLowerCase();
      const brand = (product.brand || "").toLowerCase();

      // HIGHEST PRIORITY: Previously purchased
      if (this.purchaseHistory.has(name)) {
        score += 100; // Massive boost for items you've bought before
      }

      // Prefer Bio/organic
      if (name.includes("bio") || brand.includes("bio")) score += 10;

      // Prefer local/German brands
      if (
        brand.includes("rewe") ||
        brand.includes("rapunzel") ||
        brand.includes("schär")
      )
        score += 8;

      // Prefer items without artificial additives
      if (name.includes("natur") || name.includes("rein")) score += 5;

      // Price preference (lower is better, but not the only factor)
      if (product.price) score += Math.max(0, 10 - product.price / 10);

      return { product, score };
    });

    // Sort by score (highest first)
    scored.sort((a, b) => b.score - a.score);
    return scored[0].product;
  }

  async searchAndAddItem(itemName) {
    try {
      process.stdout.write(`  Searching for: ${itemName}... `);

      // Try exact search, then a purchase-history fuzzy match, then
      // progressively simplified/normalized fallback queries.
      const match = await smartProductSearch(
        this.client,
        itemName,
        this.purchaseHistory,
        (results) => this.selectBestProduct(results, itemName)
      );

      if (!match) {
        console.log("❌ Not found (tried exact, history match, and fallback queries)");
        this.failedItems.push(itemName);
        return false;
      }

      await this.client.cart.addProductToCart(match.product.id, 1);
      console.log(`✅ Added (${match.matchedVia})`);
      this.addedItems.push(itemName);
      return true;
    } catch (error) {
      console.log(`❌ Error: ${error.message}`);
      this.failedItems.push(itemName);
      return false;
    }
  }

  async addAllGroceries() {
    console.log(`📦 Adding ${GROCERY_LIST.length} items to cart...\n`);

    for (const item of GROCERY_LIST) {
      await this.searchAndAddItem(item);
      // Small delay between requests to avoid rate limiting
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }

  showSummary() {
    console.log("\n" + "=".repeat(50));
    console.log(`✅ Added: ${this.addedItems.length} items`);

    if (this.failedItems.length > 0) {
      console.log(`❌ Failed: ${this.failedItems.length} items`);
      console.log("\nFailed items (add manually if needed):");
      this.failedItems.forEach((item) => console.log(`  - ${item}`));
    }

    console.log("\n📝 Next steps:");
    console.log("  1. Open Picnic app");
    console.log("  2. Review your cart");
    console.log("  3. Select delivery slot and checkout");
    console.log("\n✨ Automation complete!");
  }
}

function askQuestion(question) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

async function loadGroceryListFromServer(serverUrl = "https://192.168.178.78:3000") {
  try {
    const response = await fetch(`${serverUrl}/api/picnic-sync`, {
      method: "POST",
      headers: { "Content-Type": "application/json" }
    });

    if (!response.ok) throw new Error(`Server error: ${response.status}`);

    const data = await response.json();
    if (data.items && Array.isArray(data.items)) {
      GROCERY_LIST = data.items;
      console.log(`✅ Loaded ${GROCERY_LIST.length} items from meal hub\n`);
      return true;
    }
  } catch (error) {
    console.log("⚠️  Could not load from server, using command-line argument\n");
    return false;
  }
  return false;
}

async function runAutomation(username, password) {
  try {
    const automation = new PicnicAutomation(username, password);

    if (!(await automation.login())) {
      return { success: false, error: "Login failed" };
    }

    await automation.loadPurchaseHistory();
    await automation.clearCart();
    await automation.addAllGroceries();

    return {
      success: true,
      addedItems: automation.addedItems,
      failedItems: automation.failedItems,
      summary: {
        added: automation.addedItems.length,
        failed: automation.failedItems.length
      }
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

async function main() {
  try {
    let username = process.env.PICNIC_USERNAME;
    let password = process.env.PICNIC_PASSWORD;

    // Try to load shopping list from server
    await loadGroceryListFromServer();

    if (!username) {
      username = await askQuestion("Enter your Picnic email: ");
    }
    if (!password) {
      password = await askQuestion("Enter your Picnic password: ");
    }

    const result = await runAutomation(username, password);

    if (result.success) {
      console.log("\n" + "=".repeat(50));
      console.log(`✅ Added: ${result.summary.added} items`);
      if (result.summary.failed > 0) {
        console.log(`❌ Failed: ${result.summary.failed} items`);
      }
      console.log("\n📝 Next steps:");
      console.log("  1. Open Picnic app");
      console.log("  2. Review your cart");
      console.log("  3. Select delivery slot and checkout");
      console.log("\n✨ Automation complete!");
    } else {
      console.error("❌ Error:", result.error);
      process.exit(1);
    }
  } catch (error) {
    console.error("❌ Error:", error.message);
    process.exit(1);
  }
}

// Allow this to be required as a module (for server integration)
module.exports = { PicnicAutomation, runAutomation, loadGroceryListFromServer };

// Run if called directly from CLI
if (require.main === module) {
  main();
}
