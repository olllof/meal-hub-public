# 🍽️ Family Meal Planner — Vollständige Anleitung

## Überblick

Dieses System automatisiert deinen wöchentlichen Speiseplan und REWE-Einkauf:

1. **Jeden Sonntag 08:00 Uhr** → Geplanter Claude-Agent fragt dich, welche 4-5 Gerichte du diese Woche kochen möchtest
2. **Du wählst deine Gerichte** → Aus 20 bewährten Familien-Rezepten
3. **Agent erstellt Einkaufsliste** → Kombiniert Basis-Artikel + Zutaten der gewählten Gerichte
4. **Agent automatisiert REWE** → Loggt sich ein, sucht Artikel, fügt zu Warenkorb hinzu
5. **Du erhältst Benachrichtigung** → Warenkorb ist ready → du loginst ein und bestellt

## Installation

### Schritt 1: Speichern der Dateien

Die folgenden Dateien sind bereits erstellt:
- `meal-planner.html` — Interaktive Gericht-Wahl (Vorschau/Manuell)
- `rewe-cart-automation.js` — Einkaufslisten-Logik
- `MEAL_PLANNER_SETUP.md` — Diese Anleitung

### Schritt 2: REWE-Zugang vorbereiten

Stelle sicher, dass in deinem REWE-Konto folgendes aktiviert ist:
- Lieferservice ist aktiviert
- Lieferadresse hinterlegt
- Zahlungsart gespeichert

### Schritt 3: Scheduled Agent einrichten

Der Agent läuft jeden **Sonntag um 08:00 Uhr** und führt folgende Schritte aus:

```
1. "Hallo Olof! Wähle deine 4-5 Lieblingsgericht für diese Woche:"
2. [Zeigt 20 Gerichte mit Checkboxen]
3. Du wählst z.B. "Paneer-Curry", "Pad Thai", "Shakshuka"
4. Agent generiert Einkaufsliste
5. Agent automatisiert REWE:
   - Öffnet REWE.de
   - Loggt sich ein (via Password Manager)
   - Sucht jedes Artikel
   - Fügt zu Warenkorb mit richtiger Menge hinzu
6. Agent sendet dir: "Dein Warenkorb ist fertig! Bitte login und bestelle hier: [LINK]"
7. Du loginst ein, reviewst, und bestellt
```

## Basis-Artikel (wöchentlich automatisch)

Diese Artikel werden IMMER bestellt:

- König Frischkäse
- Joghurt (2x)
- Skyr
- Cheddar
- Eier
- Haferdrink (Oat Milk)
- Butter
- Crème fraîche
- Kuhmilch
- Tomaten
- Gurke
- Kartoffeln
- Gemischte Nüsse
- Äpfel
- Reiswaffeln
- Brot
- Limette
- Sardinen

## Die 20 Lieblings-Gerichte

### Vegetarisch (Vegan/Glutenfrei)
1. **Gebackene Kartoffeln mit Gemüse** (🌱 Vegetarisch, 🌾 Glutenfrei)
2. **Paneer-Curry** (🌱 Vegetarisch, 🌶️ Würzig)
3. **Shakshuka** (🌱 Vegetarisch, 🥚 Eier)
4. **Schwedische Tacos** (🥬 Gemüse, 🌮 Einfach)
5. **Indisches Blumenkohl-Curry** (🌱 Vegetarisch, 🌶️ Würzig)
6. **Galette (Gemüsekuchen)** (🌱 Vegetarisch, 🥖 Herzhaft)
7. **Patatas Tortilla mit griechischem Salat** (🌱 Vegetarisch, 🥒 Frisch)
8. **Ofengemüse mit griechischem Salat** (🌱 Vegetarisch, 🌾 Glutenfrei)
9. **Thai-Basilikum Pfannengemüse** (🌱 Vegetarisch, 🌶️ Würzig)
10. **Bibimbap** (🌱 Vegetarisch, 🌾 Glutenfrei mit GF-Sauce)
11. **Vegetarische Paella** (🌱 Vegetarisch, 🍚 Reis)
12. **Linsencurry** (🌱 Vegetarisch, 🌶️ Würzig)
13. **Ratatouille** (🌱 Vegetarisch, 🥬 Saisonal)
14. **Kichererbsen-Pfanne** (🌱 Vegan, 🌶️ Würzig)
15. **Gemüsestir-Fry mit Reis** (🌱 Vegetarisch, 🍚 Schnell)
16. **Frittata mit Gemüse** (🌱 Vegetarisch, 🥚 Eier)
17. **Thai-Grünes Curry mit Gemüse** (🌱 Vegetarisch, 🌶️ Würzig)
18. **Polenta mit Tomaten-Ragù** (🌱 Vegetarisch, 🍝 Herzhaft)
19. **Gemüse-Quiche** (🌱 Vegetarisch, 🥒 Frisch)
20. **Pad Thai** (🌶️ Würzig, 🍜 Nudeln)

## Wichtige Hinweise

### ✅ Das System macht für dich:
- Jeden Sonntag um 08:00 Uhr dich fragen, welche Gerichte du möchtest
- Einkaufsliste aus gewählten Gerichten + Basis-Artikeln erstellen
- **VOLLSTÄNDIG automatisiert zu REWE gehen**
- **Automatisch jeden Artikel in den Warenkorb legen**
- Dir sagen, wann du bestellen kannst

### ❌ Das musst du machen:
- **NUR:** Login + Review + Checkout bei REWE
- (Optional) Änderungen vornehmen falls Artikel nicht verfügbar sind

### 🌱 Nachhaltigkeit & Lage:
- **Fleisch** kaufst du weiterhin separat bei Lidl (Rabattware mit kurzen MHDs)
- **Obst** wird lokal/saisonal ausgewählt (kein Auto-Import)
- Die Delivery ist besser als mehrere Fahrten ins Geschäft

## Troubleshooting

### Problem: Agent läuft nicht pünktlich Sonntag 08:00
**Lösung:** 
- Überprüfe in Claude Code: `/config` → Scheduled Agents
- Stelle sicher, dass Cloudverbindung aktiv ist
- Kann manuell gestartet werden mit: `/schedule run meal-planner`

### Problem: Artikel wird nicht gefunden auf REWE
**Lösung:**
- Agent speichert "nicht gefunden" und fragt dich Bescheid
- Du kannst dann Marke/Größe anpassen
- Agent versucht nächstes Mal mit angepasstem Namen

### Problem: Ich möchte Artikel selbst hinzufügen/entfernen
**Lösung:**
- Der Agent erstellt die Liste mit Basis-Artikeln
- Du kannst vor Checkout im Warenkorb Änderungen vornehmen
- Oder sag dem Agent vor Freitag Bescheid: "Nächste Woche + Oregano"

## Manuelles Testen

Du kannst das System auch manuell testen:

1. Öffne `meal-planner.html` in Browser
2. Wähle 4-5 Gerichte aus
3. Reviewe die auto-generierte Einkaufsliste
4. Kopiere/notiere dir die Artikel
5. Gehe zu REWE.de und teste manuell hinzufügen (dann weißt du, wie es der Agent macht)

## Anpassungen für deine Familie

### Tochter hat Zöliakie (Glutenfreies)
- **Gekennzeichnete Gerichte:** Viele sind bereits GF oder leicht anpassbar
- **Brot & Getreide:** System bestellt automatisch GF-Varianten
- **REWE Filter:** Agent sucht automatisch GF-Versionen

### 70% Vegetarisch, 30% Fleisch (von Lidl)
- **Diese Liste:** 20/20 Gerichte sind vegetarisch ✅
- **Fleisch Lidl:** Du kaufst Fleisch separat im Lidl-Laden (Rabatte!)
- **Nur REWE:** Gemüse, Milch, Basics, Pantry-Zeug

### Saisonales Obst (lokal)
- **Baseline:** Äpfel sind immer okay
- **Saisonal (Aug/Sep):** Pflaumen, Birnen, Beeren
- **Agent fragt:** "Welches saisonale Obst diese Woche?"

## Support & Fragen

Falls etwas nicht funktioniert:
- Schreib mir: "Das Agent funktioniert nicht..."
- Ich kann Gerichte anpassen, Artikel-Zuordnung ändern, etc.

---

**Status:** ✅ Bereit zum Starten
**Startdatum:** Nächster Sonntag 08:00 Uhr
**Kontakt:** olle.ekman@gmail.com
