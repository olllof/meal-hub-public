#!/usr/bin/env python3
"""
Picnic Grocery Automation Script (HTTP API Approach)
Uses direct HTTP requests instead of browser automation to avoid anti-bot detection
"""

import os
import sys
import time
import requests
import json
from typing import Optional, List

# Disable SSL warnings for cleaner output
requests.packages.urllib3.disable_warnings()

class PicnicAPI:
    def __init__(self, username: str, password: str):
        self.username = username
        self.password = password
        self.session = requests.Session()
        self.token = None

        # Realistic headers that look like a real mobile/web client
        self.session.headers.update({
            'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15',
            'Accept': 'application/json, text/plain, */*',
            'Accept-Language': 'en-US,en;q=0.9',
            'Content-Type': 'application/json',
            'Origin': 'https://www.picnic.app',
            'Referer': 'https://www.picnic.app/',
        })

        self.added_items = []
        self.failed_items = []

    def login(self) -> bool:
        """Authenticate with Picnic API"""
        try:
            print("🔐 Authenticating with Picnic API...")

            url = "https://api.picnic.app/user/login"
            data = {
                "username": self.username,
                "password": self.password
            }

            response = self.session.post(url, json=data, verify=False)

            if response.status_code == 200:
                result = response.json()
                self.token = result.get('access_token')
                self.session.headers['Authorization'] = f'Bearer {self.token}'
                print("✅ Authentication successful!\n")
                return True
            else:
                print(f"❌ Login failed: {response.status_code}")
                print(response.text)
                return False

        except Exception as e:
            print(f"❌ Login error: {e}")
            return False

    def search_product(self, query: str) -> Optional[dict]:
        """Search for a product"""
        try:
            url = "https://api.picnic.app/search"
            params = {"q": query}

            response = self.session.get(url, params=params, verify=False, timeout=10)

            if response.status_code == 200:
                results = response.json()
                if results and len(results) > 0:
                    return results[0]
            return None

        except Exception as e:
            return None

    def add_to_cart(self, product_id: str, quantity: int = 1) -> bool:
        """Add product to cart"""
        try:
            url = f"https://api.picnic.app/cart/add_product"
            data = {
                "product_id": product_id,
                "quantity": quantity
            }

            response = self.session.post(url, json=data, verify=False, timeout=10)
            return response.status_code in [200, 201]

        except Exception as e:
            return False

    def search_and_add(self, item_name: str) -> bool:
        """Search for item and add to cart"""
        try:
            print(f"  Searching for: {item_name}...", end=" ", flush=True)

            product = self.search_product(item_name)

            if not product:
                print("❌ Not found")
                self.failed_items.append(item_name)
                return False

            product_id = product.get('id')
            if self.add_to_cart(product_id):
                print("✅ Added")
                self.added_items.append(item_name)
                return True
            else:
                print("❌ Failed to add")
                self.failed_items.append(item_name)
                return False

        except Exception as e:
            print(f"❌ Error")
            self.failed_items.append(item_name)
            return False

    def add_all_groceries(self, items: List[str]) -> None:
        """Add all items to cart"""
        print(f"📦 Adding {len(items)} items to cart...\n")

        for item in items:
            self.search_and_add(item)
            time.sleep(0.5)

    def show_summary(self) -> None:
        """Show what was added"""
        print("\n" + "=" * 50)
        print(f"✅ Added: {len(self.added_items)} items")
        if self.failed_items:
            print(f"❌ Failed: {len(self.failed_items)} items")
            print("\nFailed items (add manually):")
            for item in self.failed_items:
                print(f"  - {item}")

        print("\n📝 Next steps:")
        print("  1. Open Picnic app/website")
        print("  2. Review your cart")
        print("  3. Select delivery slot and checkout")
        print("\n✨ Done!")


# Grocery list
GROCERY_LIST = [
    "Sirtakis Joghurt nach griechischer Art 1kg",
    "Arla Skyr Natur 450g",
    "Cheddar",
    "Eier 18",
    "Haferdrink",
    "REWE Bio pflanzlich Barista Hafer-Soja Drink",
    "Butter",
    "Crème fraîche",
    "Kuhmilch",
    "Tomaten",
    "Gurke",
    "Kartoffeln",
    "Nüsse",
    "Äpfel",
    "Reiswaffeln",
    "Schär Meisterbäckers Vital glutenfrei",
    "Zitrone",
    "Delamaris Sardinen",
    "Heinz Ketchup ohne Zucker",
    "KoRo Erdnussbutter",
    "Schär Mix It Universal glutenfrei",
    "Zucchini",
    "Paprika",
    "Kirschtomaten",
    "Spinat",
    "Lauch",
    "Aubergine",
    "Galbani Mozzarella di Bufala",
    "Parmesan",
    "Rapunzel Bio gemahlene Mandeln",
    "Passierte Tomaten",
    "Basilikum",
    "Zwiebeln",
    "Knoblauch",
]


def main():
    username = os.getenv("PICNIC_USERNAME")
    password = os.getenv("PICNIC_PASSWORD")

    if not username:
        username = input("Enter your Picnic email: ")
    if not password:
        password = input("Enter your Picnic password: ")

    try:
        api = PicnicAPI(username, password)

        if not api.login():
            sys.exit(1)

        api.add_all_groceries(GROCERY_LIST)
        api.show_summary()

    except KeyboardInterrupt:
        print("\n\n⚠️  Cancelled by user")
    except Exception as e:
        print(f"\n❌ Error: {e}")


if __name__ == "__main__":
    main()
