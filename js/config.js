// ===========================================
// config.js — die EINZIGE Datei, die du nach dem Firebase-Setup anpassen musst
// ===========================================

// 1. Firebase-Projektdaten
//    Firebase Console -> Zahnrad -> Projekteinstellungen -> "Meine Apps" -> Web-App
//    -> dort den Block "firebaseConfig" kopieren und hier einsetzen.
//
//    Das ist KEIN Geheimnis: diese Werte sind bei jeder Firebase-Webseite öffentlich.
//    Geschützt wird alles durch die Regeln in firestore.rules.
//
//    Solange hier noch "DEIN_..." steht, läuft die Seite im Demo-Modus
//    (alles wird nur im eigenen Browser gespeichert).
export const firebaseConfig = {
  apiKey: "DEIN_API_KEY",
  authDomain: "DEIN_PROJEKT.firebaseapp.com",
  projectId: "DEIN_PROJEKT",
  storageBucket: "DEIN_PROJEKT.firebasestorage.app",
  messagingSenderId: "000000000000",
  appId: "DEINE_APP_ID",
};

// 2. Wer darf was?
//    - "admin":   schreibt, bearbeitet und löscht Einträge (du)
//    - "teacher": liest alles Veröffentlichte und schreibt Feedback
//    E-Mails KLEIN schreiben. Sie müssen genau gleich auch in firestore.rules stehen,
//    sonst lässt Firebase die Person nicht rein.
export const people = {
  "amkoenig009@gmail.com": { name: "Andrej König", role: "admin" },
  "lehrer@example.com": { name: "Mr Heeg", role: "teacher" },
};
