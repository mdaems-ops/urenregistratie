# Urenregistratie

Nederlandstalige web-app voor de iPhone om werktijd, overwerk, compensatie en vakantie-uren bij te houden.
De app werkt offline. Je gegevens blijven op je telefoon en gaan nergens anders heen.

## Bestanden
| Bestand | Inhoud |
|---|---|
| `index.html`, `styles.css` | Schermen en opmaak |
| `app.js` | Interface: week, saldi, planning, jaar afsluiten, instellingen, back-up, export |
| `logic.js` | Alle rekenregels (weeknorm, urensaldo, vakantie, jaarafsluiting, herinnering) |
| `xlsx.js` | Maakt Excel-bestanden zonder externe bibliotheek |
| `sw.js`, `manifest.webmanifest`, `icons/` | Offline werken en installeren op het beginscherm |
| `tests/logic.test.js` | Toetsvoorbeelden A–G en controles op jaargrens, planning en jaarafsluiting |

## Online zetten via GitHub Pages
1. Ga naar github.com, log in en kies **New repository**. Geef het de naam `urenregistratie` en maak het **Public** (gratis Pages vereist dat).
2. Kies **uploading an existing file** en sleep alle bestanden en de map `icons` uit deze map erin. De map `tests` mag ook mee. Klik **Commit changes**.
3. Ga naar **Settings → Pages**. Kies bij *Branch* `main` en `/ (root)` en klik **Save**.
4. Na een paar minuten staat de app op `https://<gebruikersnaam>.github.io/urenregistratie/`.

## Installeren op de iPhone
1. Open het adres in **Safari**.
2. Tik op de deelknop en kies **Zet op beginscherm**.
3. Open de app voortaan via het icoon **Uren**. Dan werkt hij ook offline.

## Back-up
Instellingen → **Back-up maken** → kies *Bewaar in Bestanden* → iCloud Drive.
Terugzetten gaat met **Terugzetten**. De app laat eerst zien wat er in het bestand staat.

## Tests draaien (op de Mac)
```bash
J=/System/Library/Frameworks/JavaScriptCore.framework/Versions/Current/Helpers/jsc; cat logic.js tests/logic.test.js > /tmp/t.js && echo 'runLogicTests(globalThis.Logic, print);' >> /tmp/t.js && $J /tmp/t.js
```
