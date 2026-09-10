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
  apiKey: "AIzaSyAJ89rXll_iQyv9jded_DcrsDTNmkGAJbw",
  authDomain: "ict-portfolio-3acc7.firebaseapp.com",
  projectId: "ict-portfolio-3acc7",
  storageBucket: "ict-portfolio-3acc7.firebasestorage.app",
  messagingSenderId: "478386909815",
  appId: "1:478386909815:web:6f66d291f6266fb1c88c72",
};

// 2. Wer darf was?
//    - "admin":   schreibt, bearbeitet und löscht Einträge (du)
//    - "teacher": liest alles Veröffentlichte und schreibt Feedback
//    E-Mails KLEIN schreiben. Sie müssen genau gleich auch in firestore.rules stehen,
//    sonst lässt Firebase die Person nicht rein.
export const people = {
  "andrej.koenig@edu.tbz.ch": { name: "Andrej König", role: "admin" },
  "joseph.heeg@tbz.ch": { name: "Mr Heeg", role: "teacher" },
};
