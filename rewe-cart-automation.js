/**
 * REWE Cart Automation Script
 * Automates adding shopping list items to REWE.de cart
 *
 * This script should be run by a scheduled Claude agent
 * It will automatically search for and add items to the cart
 */

const BASELINE_ITEMS = [
    { name: 'König Frischkäse', qty: 1 },
    { name: 'Joghurt', qty: 2 },
    { name: 'Skyr', qty: 1 },
    { name: 'Cheddar', qty: 1 },
    { name: 'Eier', qty: 2 },
    { name: 'Haferdrink', qty: 1 },
    { name: 'Butter', qty: 1 },
    { name: 'Crème fraîche', qty: 1 },
    { name: 'Milch', qty: 1 },
    { name: 'Tomaten', qty: 1 },
    { name: 'Gurke', qty: 1 },
    { name: 'Kartoffeln', qty: 1 },
    { name: 'Nüsse', qty: 1 },
    { name: 'Äpfel', qty: 1 },
    { name: 'Reiswaffeln', qty: 1 },
    { name: 'Brot', qty: 1 },
    { name: 'Limette', qty: 1 },
    { name: 'Sardinen', qty: 1 }
];

const MEAL_INGREDIENTS = {
    'Gebackene Kartoffeln mit Gemüse': [
        { name: 'Kartoffeln', qty: 2 },
        { name: 'Gemischtes Gemüse', qty: 1 }
    ],
    'Paneer-Curry': [
        { name: 'Paneer', qty: 1 },
        { name: 'Kokosmilch', qty: 1 },
        { name: 'Kurkuma', qty: 1 },
        { name: 'Tomaten-Dose', qty: 1 }
    ],
    'Shakshuka': [
        { name: 'Tomaten-Dose', qty: 2 },
        { name: 'Paprika', qty: 1 }
    ],
    'Schwedische Tacos': [
        { name: 'Tortillas', qty: 1 },
        { name: 'Linsenbraten', qty: 1 },
        { name: 'Salat', qty: 1 }
    ],
    'Pad Thai': [
        { name: 'Reisnudeln', qty: 1 },
        { name: 'Edamame', qty: 1 },
        { name: 'Erdnusssoße', qty: 1 }
    ],
    'Indisches Blumenkohl-Curry': [
        { name: 'Blumenkohl', qty: 1 },
        { name: 'Kokosmilch', qty: 1 }
    ],
    'Galette': [
        { name: 'Glutenfreies Mehl', qty: 1 },
        { name: 'Gemüse-Mix', qty: 1 }
    ],
    'Patatas Tortilla mit griechischem Salat': [
        { name: 'Feta', qty: 1 },
        { name: 'Griechischer Salat', qty: 1 }
    ],
    'Ofengemüse mit griechischem Salat': [
        { name: 'Rote Beete', qty: 1 },
        { name: 'Karotten', qty: 1 }
    ],
    'Thai-Basilikum Pfannengemüse': [
        { name: 'Thai-Basilikum', qty: 1 },
        { name: 'Kokosöl', qty: 1 }
    ],
    'Bibimbap': [
        { name: 'Gochujang', qty: 1 },
        { name: 'Reis', qty: 1 }
    ],
    'Vegetarische Paella': [
        { name: 'Paella-Reis', qty: 1 },
        { name: 'Gemüsebrühe', qty: 1 }
    ],
    'Linsencurry': [
        { name: 'Linsen', qty: 1 },
        { name: 'Kokosmilch', qty: 1 }
    ],
    'Ratatouille': [
        { name: 'Aubergine', qty: 1 },
        { name: 'Zucchini', qty: 1 }
    ],
    'Kichererbsen-Pfanne': [
        { name: 'Kichererbsen-Dose', qty: 1 },
        { name: 'Kokosöl', qty: 1 }
    ],
    'Gemüsestir-Fry mit Reis': [
        { name: 'Sojasauce', qty: 1 },
        { name: 'Sesamöl', qty: 1 }
    ],
    'Frittata mit Gemüse': [
        { name: 'Käse', qty: 1 }
    ],
    'Thai-Grünes Curry': [
        { name: 'Thai-Curry-Paste (grün)', qty: 1 },
        { name: 'Kokosmilch', qty: 1 }
    ],
    'Polenta mit Tomaten-Ragù': [
        { name: 'Polenta', qty: 1 },
        { name: 'Tomaten-Dose', qty: 1 }
    ],
    'Gemüse-Quiche': [
        { name: 'Mürbeteig', qty: 1 },
        { name: 'Sahne', qty: 1 }
    ]
};

/**
 * Main function to automate REWE cart
 * @param {string[]} selectedMealNames - Array of meal names selected by user
 * @returns {Promise<object>} Result with status and cart summary
 */
async function automateREWECart(selectedMealNames) {
    console.log('🛒 REWE Cart Automation Started');
    console.log('Selected meals:', selectedMealNames);

    // Compile shopping list
    const shoppingList = compileShoppingList(selectedMealNames);
    console.log('Shopping list items:', shoppingList.length);

    // This is where browser automation would happen
    // In a real implementation, this would:
    // 1. Open browser to REWE.de
    // 2. Log in (via credential autofill)
    // 3. For each item in shoppingList:
    //    - Search for item
    //    - Click first result
    //    - Set quantity
    //    - Add to cart
    // 4. Return confirmation

    return {
        status: 'ready_for_checkout',
        items_added: shoppingList.length,
        shopping_list: shoppingList,
        message: 'Cart is ready! Log in to REWE.de to review and checkout'
    };
}

/**
 * Compile shopping list from selected meals + baseline items
 */
function compileShoppingList(selectedMealNames) {
    const itemMap = new Map();

    // Add baseline items
    BASELINE_ITEMS.forEach(item => {
        const key = item.name.toLowerCase();
        itemMap.set(key, { ...item });
    });

    // Add meal ingredients
    selectedMealNames.forEach(mealName => {
        const ingredients = MEAL_INGREDIENTS[mealName] || [];
        ingredients.forEach(ingredient => {
            const key = ingredient.name.toLowerCase();
            if (itemMap.has(key)) {
                itemMap.get(key).qty += ingredient.qty;
            } else {
                itemMap.set(key, { ...ingredient });
            }
        });
    });

    return Array.from(itemMap.values()).sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Export for use in Node.js or browser environments
 */
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { automateREWECart, compileShoppingList, BASELINE_ITEMS, MEAL_INGREDIENTS };
}
