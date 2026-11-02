# Fabrik-Simulator

Ein kleines Fabrik-Aufbauspiel im Browser – ohne Installation, ohne Abhängigkeiten.

**Starten:** `index.html` im Browser öffnen.

## Spielprinzip
Baue Erz ab, schmelze es zu Platten, montiere daraus Bauteile und verkaufe sie.
Mit dem Geld baust du deine Fabrik aus, kaufst Upgrades und erfüllst Aufträge.

Produktionskette: Erz → Platten → Zahnräder / Kupferkabel → Schaltkreise → Motoren → Roboter

## Gebäude aufrüsten
Bohrer, Schmelzöfen, Montierer und Verkaufsstellen haben **4 Stufen**. Gebäude anklicken bzw. antippen und
**Aufrüsten** wählen (Taste **U**):

| Stufe | Aussehen | Wirkung |
|---|---|---|
| 1 Alt | rostig, verwittertes Holz, rußige Ziegel | Grundtempo |
| 2 Repariert | geflickte Bleche, Metallbänder | Tempo ×1,4 / Preise ×1,1 |
| 3 Modern | Industrie-Lack mit Warnstreifen, Roboterarm, Betonlager | Tempo ×1,9 / Preise ×1,25 |
| 4 Hightech | Leuchtlinien, Induktionsofen, Glasladen mit Neonschild | Tempo ×2,6 / Preise ×1,45 |

Alle 3D-Texturen werden prozedural im Browser erzeugt (`textures3d.js`).

## 3D-Modus
Mit **V** oder dem Knopf **3D-Ansicht** läufst du in der Ego-Perspektive durch deine Fabrik.
Ins Bild klicken, um die Maus zu fangen; **Esc** gibt sie wieder frei.

| Taste | Aktion |
|---|---|
| WASD | laufen (Shift = rennen) |
| Maus | umsehen |
| Leertaste | springen |
| Linksklick / Rechtsklick | bauen / abreißen (Fadenkreuz-Feld) |
| Mausrad oder 1–7 | Gebäude wählen |
| R / Q | drehen / Gebäude kopieren |
| P | Pause |

Förderbänder tragen dich mit! 3D nutzt [three.js](https://threejs.org) (liegt in `lib/`, MIT-Lizenz).

## Steuerung (2D)
| Taste | Aktion |
|---|---|
| 1–7 | Gebäude wählen |
| R / Shift+R | drehen |
| Linksklick (ziehen) | bauen, Förderbänder verlegen |
| Rechtsklick (ziehen) | abreißen |
| Q | Gebäude unter der Maus kopieren |
| WASD / Pfeiltasten, Maus ziehen | Kamera bewegen |
| Mausrad | Zoom |
| Leertaste | Pause |

Der Spielstand wird automatisch im Browser gespeichert.
