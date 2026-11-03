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

## Steuerung
Du steuerst einen Bauarbeiter, die Kamera schaut ihm von schräg oben zu. Gebaut wird direkt per Klick bzw. Tippen aufs Feld.

**PC**

| Taste | Aktion |
|---|---|
| WASD / Pfeiltasten | laufen (Shift = rennen, Leertaste = springen) |
| 1–7 | Gebäude wählen |
| Linksklick (ziehen) | bauen, Förderbänder verlegen |
| Linksklick auf Gebäude | Infos & Aufrüsten |
| Rechtsklick | abreißen |
| Maus ziehen / Q, E | Kamera drehen |
| Mausrad | zoomen |
| R / U / X | drehen / aufrüsten / Abriss-Werkzeug |
| P | Pause |

**Handy/Tablet:** Joystick zum Laufen, Gebäude wählen und aufs Feld tippen (für Bänder ziehen),
Gebäude antippen für Infos, mit einem Finger wischen zum Drehen der Kamera, zwei Finger zum Zoomen.

Förderbänder tragen dich mit! 3D nutzt [three.js](https://threejs.org) (liegt in `lib/`, MIT-Lizenz).

Der Spielstand wird automatisch im Browser gespeichert.
