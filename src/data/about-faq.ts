export type AboutFaqItem = {
  id: string;
  question: string;
  intro?: string;
  bullets?: string[];
  answer?: string;
};

export const aboutFaqItems: AboutFaqItem[] = [
  {
    id: 'formats-app',
    question: "Pourquoi certains formats sont réservés à l'application ?",
    intro:
      "Le site couvre l'essentiel dans le navigateur. D'autres cas demandent l'application desktop :",
    bullets: [
      'RAW et fichiers appareil photo : les navigateurs ne les lisent pas de façon fiable.',
      "HEIC, JXL : sur le site si le navigateur les prend en charge, sinon via l'application.",
      'EPS, PSD, AI : moteurs lourds, disponibles seulement en desktop.',
      "Formats d'image spécialisés : outils présents uniquement dans l'application.",
      'Fichiers volumineux : la mémoire du navigateur ne suffit pas pour un traitement fiable.',
    ],
  },
  {
    id: 'local',
    question: 'Mes fichiers sont-ils envoyés sur un serveur ?',
    answer:
      "Non. Sur le site, la conversion s'effectue dans votre navigateur (WebAssembly). Avec l'application desktop, tout reste sur votre machine. Aucun upload, aucun compte.",
  },
  {
    id: 'site-vs-app',
    question: "Quelle différence entre le site et l'application ?",
    answer:
      "Le site traite images, audio, documents et PDF en local (24 Mo max par lot). L'application prend le relais pour la vidéo, Office lourd, les formats techniques et les fichiers très volumineux.",
  },
  {
    id: 'gratuit',
    question: 'Le projet restera-t-il gratuit ?',
    answer:
      "Oui, gratuit à vie. Le site et l'application restent sans frais, sans abonnement et sans publicité. Projet open source : pas de version payante prévue pour convertir vos fichiers, ni de modèle freemium qui limite l'accès ou la qualité.",
  },
];
