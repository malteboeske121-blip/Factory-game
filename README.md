# Fabrik-Simulator

Ein kleines Fabrik-Aufbauspiel im Browser – ohne Installation, ohne Abhängigkeiten.

**Starten:** `index.html` im Browser öffnen.

## Welt
Die Karte hat 128 × 96 Felder. Um sie herum liegt eine Landschaft mit Holzzaun, Mischwald, Seen,
Hügeln und schneebedeckten Bergen. Alte Spielstände (64 × 48) werden automatisch in die Mitte der
großen Karte übernommen.

## Start
Jedes neue Spiel beginnt mit **1.000 €** und einer fertigen **Startfabrik**: Eisen- und Kohlebohrer liefern über
Förderbänder an einen Schmelzofen, die Eisenplatten gehen direkt zum Verkauf.

**Pfeile am Boden:** gelb = Ausgang (rot = blockiert), grün = Eingang. Schmelzofen und Montierer haben
3 Eingänge (hinten, links, rechts) und 1 Ausgang (vorne).

## Spielprinzip
Baue Erz ab, schmelze es zu Platten, montiere daraus Bauteile und verkaufe sie.
Mit dem Geld baust du deine Fabrik aus, kaufst Upgrades und erfüllst Aufträge.

Produktionskette: Erz → Platten → Zahnräder / Kupferkabel → Schaltkreise → Motoren → Roboter

## Erze und Vorkommen
Sechs Erzsorten: **Eisen, Kupfer, Kohle, Stein, Gold, Quarz** (Gold und Quarz sind selten und liegen weiter außen).
Jedes Vorkommen hat einen eigenen Vorrat (arm, mittel, reich, sehr reich) – ein Klick auf ein Erzfeld zeigt ihn an.
Bohrer bauen die Felder im Umkreis (3 × 3) ab; die Felsbrocken schrumpfen dabei, bis das Feld leer ist.

Je nach Erz entsteht automatisch der passende Bohrer:

| Erz | Bohrer | Preis |
|---|---|---|
| Eisen, Kupfer | Erzbohrer (Bohrturm) | 40 € |
| Kohle | Kohlebagger (Schaufelrad) | 40 € |
| Stein | Steinbruch (Steinsäge) | 32 € |
| Gold | Goldwäscher (Waschtrommel) | 120 € |
| Quarz | Quarzlaser | 100 € |

## Verarbeitung
- **Schmelzofen:** Eisen-/Kupfererz → Platten, Stein → Ziegel, 2 Golderz → Goldbarren, Quarz → Silizium, 3 Eisenplatten → Stahl
- **Montierer:** Zahnrad, Kupferkabel, Schaltkreis, Motor, Roboter, Akku, Solarmodul, Prozessor, Drohne

## Gebäude aufrüsten
Bohrer, Schmelzöfen, Montierer und Verkaufsstellen haben **6 Stufen** (Taste **U** oder Info-Fenster):

| Stufe | Aussehen | Wirkung |
|---|---|---|
| 1 Alt | rostig, verwittertes Holz, rußige Ziegel | Grundtempo |
| 2 Repariert | geflickte Bleche, Metallbänder | Tempo ×1,4 / Preise ×1,1 |
| 3 Modern | Industrie-Lack, Warnlampen, Roboterarm | Tempo ×1,9 / Preise ×1,25 |
| 4 Hightech | Leuchtlinien, Induktionsofen, Glasladen | Tempo ×2,6 / Preise ×1,45 |
| 5 Futuristisch | schwebt über Landeplattform, Energiekern, Hologramm-Ringe (cyan) | Tempo ×3,6 / Preise ×1,7 |
| 6 Quanten | violettes Leuchten, kreisende Energiekugeln, Lichtsäule | Tempo ×5 / Preise ×2 |

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
