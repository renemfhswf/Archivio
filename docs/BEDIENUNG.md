# Bedienung

## 1. Quelle öffnen

Beim Start zeigt Archivio links die verfügbaren Laufwerke und den
Benutzerordner. Ein Klick auf einen Eintrag öffnet den Ordner im
Dateibrowser. Über den Pfeil neben einem Ordner lässt sich der Baum
aufklappen.

Alternativ:

- **Strg + O** – Quellordner über den Windows-Dialog öffnen
- **Strg + Umschalt + O** – neuen Archivordner hinzufügen
- **F5** – aktuellen Ordner neu einlesen
- Doppelklick auf einen Ordner – hineinwechseln
- Doppelklick auf eine Datei – mit dem Standardprogramm öffnen

## 2. Dateien prüfen

Ein Klick markiert eine Datei und zeigt sie rechts in der Vorschau.
**Strg + Klick** erweitert die Auswahl, **Umschalt + Klick** wählt einen
Bereich. Im Dateibrowser funktionieren außerdem Pfeiltasten, **Pos1**,
**Ende**, **Enter** und **Strg + A**.

Der Filter oben rechts durchsucht den aktuellen Ordner nach Namen.
Die Spaltenköpfe sortieren nach Name, Größe, Änderungsdatum oder Typ;
ein zweiter Klick dreht die Reihenfolge um.

Die Vorschau zeigt:

- Bilder (Zoom und Zurücksetzen)
- PDFs (Seitenwechsel, Zoom)
- Word-Dokumente (`.docx`)
- Excel-Tabellen (`.xlsx`, Blattwechsel)
- Text- und Code-Dateien
- Video und Audio

Nicht unterstützte Formate lassen sich über **Extern öffnen** im
Standardprogramm anzeigen.

## 3. Ziel wählen

Ein Archivziel ist ein Ordner, in dem die sortierten Dateien landen.
Du kannst beliebig tief verschachtelte Ordner als Ziel wählen.

- **Ziel wählen** in der Seitenleiste oder im Dateibrowser
- **Archivziele → +** fügt einen dauerhaften Archivordner hinzu
- Ein Klick auf einen Ordner im Bereich **Archivziele** setzt ihn als
  aktuelles Ziel
- Ein Klick auf **Ziel ändern** im Bereich **Aktuelles Ziel** öffnet den
  Ordnerdialog

Neue Archivordner werden in den Einstellungen gespeichert und erscheinen
beim nächsten Start wieder.

## 4. Dateien ablegen

Es gibt drei Wege, Dateien in die Ablage zu legen:

1. Dateien markieren und **Ablegen (n)** klicken.
2. Dateien aus dem Dateibrowser auf einen Zielordner im Baum ziehen.
3. In der Ablage das Ziel einer einzelnen Datei über das Ordnersymbol
   ändern.

Die Ablage zeigt pro Datei das Ziel und die Größe. Über das **X** wird
eine Datei entfernt, über den Papierkorb die gesamte Ablage geleert.

## 5. Kopieren und Konflikte

**Kopieren starten** prüft zuerst alle Ziele. Dabei entstehen drei
Zustände:

| Zustand | Bedeutung |
| --- | --- |
| Ohne Konflikt | Zielname ist frei, die Datei kann kopiert werden. |
| Identischer Inhalt | Im Ziel liegt bereits eine Datei mit gleicher Größe und gleicher SHA-256-Prüfsumme. |
| Name vergeben | Im Ziel liegt eine andere Datei mit demselben Namen. |

Bei der Strategie **Jedes Mal fragen** erscheint ein Dialog. Dort kannst
du jeden Konflikt einzeln oder alle gemeinsam entscheiden:

- **Überspringen** – die Datei wird nicht kopiert.
- **Umbenennen** – Archivio wählt einen freien Namen wie `Foto (2).jpg`.
- **Ersetzen** – die vorhandene Datei wird überschrieben. Bei identischem
  Inhalt ist das unnötig; der Dialog weist darauf hin.

In den Einstellungen lässt sich eine feste Standardstrategie wählen.
Fehlerhafte Dateien bleiben in der Ablage, damit du sie nach dem Beheben
des Problems erneut starten kannst.

Während des Kopierens zeigt die Ablage den Fortschritt pro Datei und
insgesamt. **Abbrechen** stoppt den laufenden Vorgang; bereits fertige
Dateien bleiben erhalten.

## 6. Duplikate finden

Wechsle über die Kopfzeile zu **Duplikate**.

1. Lege die Suchordner fest. Standardmäßig werden die Archivziele
   übernommen.
2. Wähle eine Mindestgröße. Kleine Dateien wie `desktop.ini` lassen sich
   so ausblenden.
3. Entscheide, ob versteckte Dateien einbezogen werden.
4. Starte **Duplikate suchen**.

Archivio durchsucht die Ordner rekursiv, gruppiert Dateien zunächst nach
Größe und vergleicht anschließend die SHA-256-Prüfsumme. Nur Gruppen mit
mindestens zwei identischen Dateien erscheinen im Ergebnis.

Jede Gruppe zeigt:

- Anzahl und Größe der Dateien
- einsparbaren Platz
- alle Fundorte mit Datum
- eine als **Behalten** markierte Datei

Über die Radiobuttons legst du fest, welche Datei bleiben soll. Die
Checkboxen markieren die Dateien, die entfernt werden sollen.
**Älteste behalten** und **Neueste behalten** setzen die Auswahl für alle
Gruppen neu.

### Aktionen

| Aktion | Wirkung | Wiederherstellbar |
| --- | --- | --- |
| Quarantäne | Verschiebt die Dateien in einen frei wählbaren Ordner und behält die relative Struktur. | Ja, Dateien bleiben vorhanden. |
| Papierkorb | Verschiebt die Dateien in den Windows-Papierkorb. | Ja, solange der Papierkorb nicht geleert wird. |
| Endgültig löschen | Löscht die Dateien sofort. Bestätigung mit `LÖSCHEN` erforderlich. | Nein. |

Pro Gruppe muss immer mindestens eine Datei erhalten bleiben. Der Bericht
wird nach jeder Aktion aktualisiert.

### Export

**CSV** und **JSON** schreiben den aktuellen Bericht in eine Datei deiner
Wahl. Der Export enthält Gruppen, Pfade, Größen, Datum und
Einsparpotenzial.

## 7. Einstellungen

- **Archivziele** – dauerhafte Zielordner, hinzufügen und entfernen
- **Kopieren** – Standardstrategie, Prüfsumme, Zeitstempel,
  Parallelität
- **Duplikatsuche** – Mindestgröße, versteckte Dateien,
  Ausschlussnamen, Quarantäneordner
- **Vorschau** – maximale Textgröße
- **Darstellung** – dunkel, hell oder Systemeinstellung
- **Daten & Protokoll** – Version, Datenordner und Protokolldatei öffnen

Änderungen werden sofort gespeichert.

## 8. Verlauf

Der Verlauf listet Kopiervorgänge, Duplikat-Aktionen und Suchläufe mit
Zeitpunkt, Anzahl, Größe und Fehlern. Er dient nur der
Nachvollziehbarkeit und lässt sich leeren, ohne Dateien zu verändern.

## Tastenkürzel

| Kürzel | Funktion |
| --- | --- |
| `Strg + O` | Quellordner öffnen |
| `Strg + Umschalt + O` | Archivordner hinzufügen |
| `Strg + ,` | Einstellungen öffnen |
| `F5` | Aktuellen Ordner aktualisieren |
| `Strg + A` | Alle Dateien im Ordner auswählen |
| `Enter` | Markierte Datei öffnen |
| `Pfeil oben/unten` | Auswahl bewegen |
| `Pos1` / `Ende` | Erste/letzte Datei auswählen |
| `Esc` | Dialog schließen |

## Sicherheitsregeln

- Quelldateien werden nie verändert oder gelöscht.
- Kopien werden erst nach vollständigem Schreiben und optionaler
  Prüfsummenkontrolle an ihren endgültigen Namen umbenannt.
- Beim Ersetzen wird die vorhandene Datei gesichert und bei einem Fehler
  wiederhergestellt.
- Endgültiges Löschen erfordert die Eingabe von `LÖSCHEN`.
- Ohne ausdrückliche Aktion im Duplikat-Bereich löscht Archivio nichts.
