# Architektur

## Überblick

Archivio ist eine Electron-Anwendung mit drei klar getrennten Teilen:

```text
┌────────────────────────────────────────────────────────────┐
│ Renderer (React, TypeScript)                               │
│  Ansichten, Auswahl, Vorschau, Ablage, Dialoge             │
└──────────────────────────┬─────────────────────────────────┘
                           │ window.archivio (contextBridge)
┌──────────────────────────▼─────────────────────────────────┐
│ Preload (sandboxed)                                        │
│  typisierte, schmale IPC-Brücke                            │
└──────────────────────────┬─────────────────────────────────┘
                           │ ipcRenderer.invoke / Events
┌──────────────────────────▼─────────────────────────────────┐
│ Main (Node.js)                                             │
│  Dateisystem, Dialoge, Kopieren, Hashing, Duplikate        │
└────────────────────────────────────────────────────────────┘
```

Der Renderer hat **keinen** direkten Node- oder Dateisystemzugriff.
`contextIsolation`, `sandbox` und `nodeIntegration: false` sind aktiv.
Alle Dateioperationen laufen im Hauptprozess und werden dort validiert.

## Verzeichnisse

```text
src/
  main/
    index.ts             Electron-Start, Fenster, Sicherheit
    ipc.ts               alle IPC-Kanäle und Eingabevalidierung
    copy-service.ts      Kopierplanung, Konflikte, sichere Kopie
    duplicate-service.ts rekursive Suche, Hashing, Aktionen, Export
    file-service.ts      Ordnerlisten, Vorschau-Metadaten, Textvorschau
    file-protocol.ts     eigenes Protokoll für große Dateien
    hash.ts              SHA-256, Cache, Nebenläufigkeitshelfer
    settings.ts          Einstellungen als JSON
    history.ts           Verlauf als JSON
    paths.ts             Pfadnormalisierung, Laufwerke, Schutzregeln
    logger.ts            Protokoll im Datenordner
  preload/
    index.ts             contextBridge-API
    archivio.d.ts        globale Typdeklaration für window.archivio
  renderer/src/
    App.tsx              Gerüst, Theme, Tastenkürzel, Boot
    store/useAppStore.ts zentraler Zustand (Zustand)
    components/          Ansichten und Dialoge
    styles/global.css    Farbschema und Layout
  shared/
    types.ts             Verträge zwischen Main, Preload und Renderer
    constants.ts         Standardwerte und Grenzen
    format.ts            deutsche Formatierung
    naming.ts            Namens- und Pfadlogik
    duplicates.ts        Gruppierung und Behalten-Vorschläge
    csv.ts               CSV-Escaping
    fileTypes.ts         Endungen, MIME-Typen, Vorschauart
    fileUrl.ts           URLs für das eigene Protokoll
tests/                   Vitest-Unit-Tests
```

## Datenfluss: Sortieren und Kopieren

1. Der Renderer liest über `fs:roots` verfügbare Laufwerke und über
   `fs:list` einen Ordner.
2. Auswahl und Ablage liegen im Zustand des Renderers.
3. `copy:plan` erhält die Aufträge und prüft für jeden Auftrag:
   - Existiert die Quelle und ist sie eine Datei?
   - Ist das Ziel ein Ordner?
   - Sind Quelle und Ziel identisch?
   - Existiert der Zielname bereits?
   - Sind Größe und SHA-256 identisch?
4. Das Ergebnis ist ein `CopyPlan` mit `ready`, `conflict` oder `error`.
5. Bei Bedarf entscheidet der Nutzer im Konfliktdialog.
6. `copy:start` führt den Plan aus und sendet `copy:progress`-Events.
7. Der Renderer aktualisiert Fortschritt, Ablage und Zusammenfassung.

Ein Plan ist zwei Stunden gültig und wird nach dem Start verworfen.
Zwischen Planung und Start entstandene Zieldateien werden erneut geprüft.

## Sichere Kopie

`copyFileSafe` arbeitet in dieser Reihenfolge:

1. Zielordner anlegen.
2. Quelle und vorhandenes Ziel prüfen.
3. In eine temporäre Datei `.archivio-<uuid>.tmp` im Zielordner
   schreiben (Flag `wx`, keine versehentliche Wiederverwendung).
4. Datei mit `fsync` auf den Datenträger zwingen.
5. Optional SHA-256 der Quelle während des Schreibens berechnen und mit
   der temporären Datei vergleichen.
6. Vorhandenes Ziel als `.archivio-<uuid>.bak` beiseitelegen.
7. Temporäre Datei atomar auf den endgültigen Namen umbenennen.
8. Sicherung löschen.
9. Optional Änderungs- und Zugriffszeit der Quelle übernehmen.

Bei einem Fehler werden temporäre Datei und Sicherung entfernt bzw. das
Original wiederhergestellt. Ein Abbruch über `AbortSignal` beendet den
Stream und räumt auf.

## Duplikatsuche

1. `duplicates:start` validiert die Wurzelordner und startet die Suche
   asynchron.
2. Der Walker durchläuft die Ordner rekursiv, überspringt
   Systemverzeichnisse und Ausschlussnamen und sammelt Dateien ab der
   Mindestgröße.
3. Dateien werden nach Größe gruppiert. Größen mit nur einem Vertreter
   scheiden aus.
4. Kandidaten werden mit begrenzter Parallelität gehasht. Der
   `HashCache` vermeidet doppelte Arbeit, solange Größe und
   Änderungszeit unverändert sind.
5. `buildDuplicateGroups` gruppiert nach `Größe:Hash` und berechnet
   Belegung und Einsparpotenzial.
6. Fortschritt wird über `duplicate:progress` gesendet, der fertige
   Bericht über `duplicates:get` geholt.

Aktionen (`quarantine`, `trash`, `delete`) prüfen zuerst, ob jede Datei
zum aktuellen Bericht gehört und ob pro Gruppe mindestens eine Datei
erhalten bleibt. Danach werden die Dateien entfernt und der Bericht
neu berechnet. Der Verlauf erhält einen Eintrag.

## Vorschau

Der Hauptprozess liefert nur Metadaten und einen Link auf das eigene
Protokoll `archivio-file://local/<kodierter-pfad>`.

- Bilder, PDFs, Office-Dateien, Video und Audio werden per URL geladen.
- Das Protokoll unterstützt `Range`-Anfragen, damit PDF.js und
  Medienplayer große Dateien streamen können.
- Textdateien werden bis zur eingestellten Grenze direkt gelesen.
- Binärdateien werden erkannt und nicht als Text ausgegeben.
- PDF, DOCX und XLSX werden im Renderer dargestellt; die Datei verlässt
  dabei nicht den lokalen Rechner.

## Sicherheitsmodell

- Renderer ohne Node-Zugriff, mit Sandbox und Context Isolation.
- Ausschließlich feste IPC-Kanäle; jede Eingabe wird auf Typ, Pfad und
  erlaubte Werte geprüft.
- Absolute Pfade sind Pflicht. Relative Pfade werden abgelehnt.
- Kein `shell.openExternal` für beliebige Schemata, nur `http`/`https`.
- Navigation und neue Fenster werden blockiert.
- Berechtigungsanfragen der Seite werden abgelehnt.
- Endgültiges Löschen nur mit Bestätigungstoken `LÖSCHEN`.
- Quarantäne und Papierkorb sind die sicheren Standardaktionen.

## Persistenz

Im Electron-Datenordner liegen:

- `settings.json` – Einstellungen, zuletzt verwendete Pfade
- `history.json` – Verlauf, begrenzt auf die letzten Einträge
- `archivio.log` – Protokoll

Schreibvorgänge erfolgen über temporäre Dateien und Umbenennen, damit
ein Absturz keine halben JSON-Dateien hinterlässt. Ungültige oder
fehlende Dateien werden durch Standardwerte ersetzt.

## Tests

Vitest prüft ohne Electron:

- Formatierung von Größen, Zahlen und Dauer
- Namenszerlegung, Nummerierung, Sanitizing und Pfadvergleiche
- Duplikatgruppierung, Behalten-Vorschläge und Summen
- CSV-Escaping
- sichere Kopie: Inhalt, temporäre Dateien, Ersetzen, Zeitstempel,
  Abbruch
- Kopierplanung: frei, Duplikat, Namenskonflikt, Fehler, unbekannter Plan

Die Tests laufen in `tests/` mit temporären Ordnern und räumen danach auf.

## Build und Release

- `electron-vite` baut Main, Preload und Renderer nach `out/`.
- `electron-builder` erzeugt unter Windows einen NSIS-Installer und eine
  portable `.exe` in `release/`.
- Die CI prüft Typen, Tests und den Produktions-Build auf Linux.
- Der Release-Workflow baut auf `windows-latest`, lädt die Artefakte hoch
  und veröffentlicht sie bei einem Tag `v*` als GitHub-Release.

## Erweiterungspunkte

- Weitere Vorschauformate: `shared/fileTypes.ts` und die
  Vorschaukomponenten ergänzen.
- Weitere Konfliktstrategien: `ConflictDecision`, `copy-service.ts` und
  den Dialog erweitern.
- Persistente Duplikatberichte: `DuplicateService` um Speichern/Laden
  ergänzen.
- Übersetzungen: Texte liegen aktuell direkt in den Komponenten.
