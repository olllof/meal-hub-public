/**
 * Multi-strategy product search for the Picnic catalog.
 *
 * A plain `client.catalog.search(itemName)` call is a single, exact-text
 * lookup - it returns nothing for typos, OCR-mangled names, overly verbose
 * branded names, or names carrying a quantity prefix ("1 l Skyr"). This
 * module tries several fallback strategies in order before giving up, and
 * is shared by meal-hub-server.js and add_groceries.js so a fix only has
 * to happen once.
 */

// --- text normalization helpers ---

const ACCENT_MAP = {
  ä: "a", ö: "o", ü: "u", ß: "ss",
  Ä: "A", Ö: "O", Ü: "U",
  é: "e", è: "e", ê: "e", à: "a", â: "a", î: "i", ô: "o", û: "u", ç: "c",
};

function foldAccents(text) {
  return text.replace(/[äöüßÄÖÜéèêàâîôûç]/g, (ch) => ACCENT_MAP[ch] || ch);
}

function normalizeWhitespace(text) {
  return text.replace(/\s+/g, " ").trim();
}

// Strip leading/trailing quantity tokens like "1 l", "500g", "2x", "10%"
function stripQuantities(text) {
  return normalizeWhitespace(
    text
      .replace(/\b\d+[\d.,]*\s*(kg|g|l|ml|cl|x|stk|pack|%)\b\.?/gi, " ")
      .replace(/[%]/g, " ")
  );
}

// Remove punctuation that search indexes often don't tokenize well (&, /, etc.)
function stripPunctuation(text) {
  return normalizeWhitespace(text.replace(/[&/|]/g, " "));
}

function significantWords(text) {
  return normalizeWhitespace(text).split(" ").filter((w) => w.length > 1);
}

// --- fuzzy matching against purchase history ---

function levenshtein(a, b) {
  a = a.toLowerCase();
  b = b.toLowerCase();
  const m = a.length, n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
    }
    prev = cur;
  }
  return prev[n];
}

// Find a purchase-history entry whose name is a very close match (typo/OCR
// distance, not a different product) to itemName. Returns the stored
// article object (which carries a real product id we can add directly) or
// null.
function findClosePurchaseHistoryMatch(itemName, purchaseHistory) {
  if (!purchaseHistory || purchaseHistory.size === 0) return null;
  const target = itemName.toLowerCase().trim();
  if (!target) return null;

  let best = null;
  let bestDistance = Infinity;

  for (const [name, article] of purchaseHistory.entries()) {
    if (!name) continue;
    // Cheap pre-filter: skip names wildly different in length before
    // paying for a full Levenshtein pass.
    if (Math.abs(name.length - target.length) > Math.max(6, target.length * 0.3)) {
      continue;
    }
    const distance = levenshtein(target, name);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = article;
    }
  }

  if (!best) return null;

  // Threshold scales with name length: allow ~12% character drift, at
  // least 1, capped at 4 so long names don't accept a loose match.
  const threshold = Math.min(4, Math.max(1, Math.floor(target.length * 0.12)));
  return bestDistance <= threshold ? best : null;
}

// --- building the ordered list of search queries to try ---

function buildFallbackQueries(itemName) {
  const queries = [];
  const seen = new Set();
  const add = (q) => {
    const clean = normalizeWhitespace(q);
    const key = clean.toLowerCase();
    if (clean && !seen.has(key)) {
      seen.add(key);
      queries.push(clean);
    }
  };

  add(itemName);
  add(stripPunctuation(itemName));
  add(foldAccents(itemName));
  add(stripQuantities(itemName));
  add(stripQuantities(stripPunctuation(foldAccents(itemName))));

  // Last 2 words, then last word - catches verbose branded names like
  // "Edeka Bio Bio Weizen Wraps" -> "Weizen Wraps" -> "Wraps"
  const words = significantWords(stripQuantities(itemName));
  if (words.length > 2) add(words.slice(-2).join(" "));
  if (words.length > 1) add(words[words.length - 1]);

  return queries;
}

/**
 * Try to find and select a product for itemName, trying multiple search
 * strategies before giving up.
 *
 * @param client - authenticated picnic-api client
 * @param itemName - the raw shopping-list item text
 * @param purchaseHistory - Map<lowercase name, article> from loadPurchaseHistory
 * @param selectBestProduct - (results, purchaseHistory) => product, the existing scorer
 * @returns {Promise<{product: object, matchedVia: string} | null>}
 */
async function smartProductSearch(client, itemName, purchaseHistory, selectBestProduct) {
  // 1. Fuzzy match against purchase history first - if this item is a
  // near-exact match for something already bought, use that known product
  // directly rather than trusting the search index to handle a typo/OCR
  // error the same way.
  const historyMatch = findClosePurchaseHistoryMatch(itemName, purchaseHistory);
  if (historyMatch && historyMatch.id) {
    return { product: historyMatch, matchedVia: `purchase history match for "${itemName}"` };
  }

  // 2. Try the search API with progressively more normalized/simplified
  // queries until one returns a usable result.
  for (const query of buildFallbackQueries(itemName)) {
    try {
      const results = await client.catalog.search(query);
      if (results && results.length > 0) {
        const product = selectBestProduct(results, purchaseHistory);
        if (product) {
          return {
            product,
            matchedVia: query === itemName ? "exact search" : `fallback query "${query}"`,
          };
        }
      }
    } catch (err) {
      // Try the next strategy rather than aborting the whole item.
      continue;
    }
  }

  return null;
}

module.exports = {
  smartProductSearch,
  buildFallbackQueries,
  findClosePurchaseHistoryMatch,
  levenshtein,
  foldAccents,
  stripQuantities,
  stripPunctuation,
};
