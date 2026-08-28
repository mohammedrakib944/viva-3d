export type Milestone = {
  year: string;
  title: string;
  desc: string;
  story: string[];
  client: { name: string; tag: string; color: string };
};

// NOTE: story bullets beyond the founding (2016) and closing (2026) years
// are placeholder flavor text — swap in real yearly history when available.
export const MILESTONES: Milestone[] = [
  {
    year: "2016",
    title: "INITIAL COMMIT",
    desc: "Vivasoft is founded. A small team, a big idea.",
    story: [
      "A handful of engineers, one rented desk, zero clients.",
      "The first line of code that would become a decade of work.",
    ],
    client: { name: "MyCash", tag: "FIRST PRODUCT", color: "#4fd6ff" },
  },
  {
    year: "2017",
    title: "FIRST DISCIPLINES",
    desc: "Frontend, backend, QA, DevOps, mobile take shape.",
    story: [
      "The team stops being generalists and starts specializing.",
      "First real production incident. First real on-call rotation.",
    ],
    client: { name: "Hink", tag: "EARLY PRODUCT", color: "#8b7bff" },
  },
  {
    year: "2018",
    title: "GROWING PRACTICE",
    desc: "From a small team to a global software partner.",
    story: [
      "The office gets a second room. Then a third.",
      "Clients start asking for us by name, not by rate card.",
    ],
    client: { name: "Klikit", tag: "CLIENT PARTNER", color: "#3866ff" },
  },
  {
    year: "2019",
    title: "TECHNOLOGY DEPTH",
    desc: "100+ technologies: React, Node, .NET, Python, Flutter.",
    story: [
      "Polyglot by necessity — every client, a different stack.",
      "The internal wiki of \"how we do things\" starts to matter.",
    ],
    client: { name: "Wellteam", tag: "CLIENT PARTNER", color: "#5ad1a8" },
  },
  {
    year: "2020",
    title: "CLOUD & SCALE",
    desc: "AWS, Azure, and scalable system design.",
    story: [
      "Remote-first, out of necessity, then by choice.",
      "Infrastructure stops being an afterthought.",
    ],
    client: { name: "Azerion", tag: "GLOBAL CLIENT", color: "#ff9f5a" },
  },
  {
    year: "2021",
    title: "PRODUCTS SHIPPED",
    desc: "MyCash, Hink, Klikit, Wellteam — built by Vivasoft.",
    story: [
      "Not just outsourced work — products with our fingerprints on them.",
      "The portfolio starts speaking louder than the pitch deck.",
    ],
    client: { name: "Limestone Lab", tag: "CLIENT PARTNER", color: "#ff5a8f" },
  },
  {
    year: "2022",
    title: "GLOBAL CLIENTS",
    desc: "50+ companies across the world trust Vivasoft.",
    story: [
      "Timezones stop being a blocker and start being a feature.",
      "Teams embedded directly inside client product orgs.",
    ],
    client: { name: "MyCash", tag: "FINTECH PRODUCT", color: "#4fd6ff" },
  },
  {
    year: "2023",
    title: "QUALITY BY DESIGN",
    desc: "ISO/IEC certified engineering and security standards.",
    story: [
      "Process grows up: audits, standards, security reviews.",
      "\"It works on my machine\" stops being an acceptable answer.",
    ],
    client: { name: "Hink", tag: "PRODUCT", color: "#8b7bff" },
  },
  {
    year: "2024",
    title: "AI & ML",
    desc: "Investing in machine learning and intelligent systems.",
    story: [
      "New team, new discipline, same restless curiosity.",
      "The stack that got us here isn't the stack that gets us further.",
    ],
    client: { name: "Klikit", tag: "CLIENT PARTNER", color: "#3866ff" },
  },
  {
    year: "2025",
    title: "ONE ECOSYSTEM",
    desc: "300+ engineers, one growing network.",
    story: [
      "Hundreds of engineers who've never sat in the same room.",
      "Still one culture, still one way of building.",
    ],
    client: { name: "Wellteam", tag: "CLIENT PARTNER", color: "#5ad1a8" },
  },
  {
    year: "2026",
    title: "TEN YEARS",
    desc: "Top Software, AI & Staff Augmentation Company — Clutch, GoodFirms.",
    story: [
      "Recognized industry-wide — but built for the people inside it.",
      "Ten years down. The next chapter starts now.",
    ],
    client: { name: "Vivasoft", tag: "TEN YEARS", color: "#4fd6ff" },
  },
];

export type StatCard = {
  label: string;
  value: string;
};

export const STAT_CARDS: StatCard[] = [
  { value: "300+", label: "ENGINEERS" },
  { value: "50+", label: "GLOBAL CLIENTS" },
  { value: "100+", label: "TECHNOLOGIES" },
  { value: "ISO/IEC", label: "CERTIFIED" },
];

export const TUNNEL_LENGTH = 90;
export const TEN_Z = -TUNNEL_LENGTH - 6;
// Scroll progress at which the opening "10 years" particle text has
// finished breaking apart into the tunnel. Shared with CameraRig so it can
// hold the camera steady (no sway) for exactly as long as the text is
// still legible.
export const INTRO_END = 0.18;

// Shared so every 3D-text component reuses the same cached font fetch.
export const FONT_URL =
  "https://threejs.org/examples/fonts/helvetiker_bold.typeface.json";
