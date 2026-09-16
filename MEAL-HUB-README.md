# 🍽️ Shared Meal Planning Hub

A real-time meal planner accessible to both users on local WiFi with voice input support.

## Quick Start

### 1. Start the Server
```bash
./start-meal-hub.sh
```

The script will show you the IP address to access from your phone/tablet.

### 2. Open on Your Devices
- **On Mac/Phone/Tablet:** Open `http://192.168.x.x:3000` (use the IP shown when server starts)
- Both of you can access from the same WiFi network
- All changes sync in real-time between devices

## Features

### 📅 Weekly Meal Planning
- Click **"Generate This Week's Meals"** to get a random selection from your classics (11 meals) + suggestions (1-2 meals)
- Manually add/remove meals anytime
- Mark any meal as a "Classic" to rotate it weekly

### 🛒 Shopping List
- Baseline staple items are automatically included
- Add extra items anytime (including via voice)
- Check off items as you shop
- Share between users - both see updates in real-time

### 🎤 Voice Input
- **Hold the microphone button** to speak
- Say meal names: *"Add Pad Thai"* → adds to weekly meals
- Say item names: *"Add milk"* → adds to shopping list
- Works in English

### ⭐ Manage Classics
- Go to the **Classics** tab to see your recurring favorites
- Add meals to classics from the weekly plan
- Remove meals if your tastes change
- Your 11 classics rotate into every weekly plan automatically

## How It Works

**Weekly Flow:**
1. Sunday: Generate this week's meals (automatic mix of classics + suggestions)
2. Throughout week: Both of you add extra items as you think of them
3. When ready: Shopping list is ready to sync with Picnic automation

**Real-time Sync:**
- Changes on one device appear instantly on the other
- Uses WebSockets for live updates
- Data saved locally to `meal-hub-data.json`

## Integration with Picnic

Once your shopping list is ready:
```bash
node add_groceries.js
```

The script will read from `meal-hub-data.json` and add all items to your Picnic cart automatically.

## Tips

- 🎤 Voice works best in quiet environments
- 📱 Mobile-optimized - perfect for using from kitchen
- 👥 Either person can manage meals/shopping
- 💡 Try: *"Add halloumi stroganoff"* or *"Add eggs"*

## Troubleshooting

**Can't access from phone?**
- Make sure both devices are on the same WiFi
- Check firewall isn't blocking port 3000
- Use the exact IP shown when server starts

**Voice input not working?**
- Works best in Chrome/Safari on iPhone
- Make sure to allow microphone permissions
- Speak clearly and wait for the beep

**Data disappeared?**
- Meal data is saved to `meal-hub-data.json`
- You can edit this file directly if needed
