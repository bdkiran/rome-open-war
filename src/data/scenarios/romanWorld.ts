import type { Scenario } from "@/data/scenarios/types.js";
import { europeMapEngine } from "@/map/europe/europeMapEngine.js";

/**
 * 218 BC, the outbreak of the Second Punic War. Rome holds Italy and
 * Carthage the coasts of Africa and Spain and the western islands; the
 * Greek leagues, Macedon, the Seleucids and Egypt divide the east; the
 * Gauls, Germans, Britons and Iberians hold the west and north; Numidia,
 * Thrace, Dacia, Scythia and Pontus the lands between. Factions hold
 * different numbers of cities. Seleucia, beyond the map's eastern edge,
 * sits on the edge instead. A few crowded cities are moved from their real
 * sites, so every city has land enough to grow into a level-3 city.
 */
export const ROMAN_WORLD: Scenario = {
  name: "The Roman World, 218 BC",
  mapEngine: europeMapEngine,
  seed: 218,
  factions: [
    {
      id: "rome", name: "Roman Republic", shortName: "Rome", color: "#c0392b", controller: "human",
      cities: [
        { name: "Roma", lon: 12.5, lat: 41.9, capital: true },
        { name: "Arretium", lon: 11.88, lat: 43.46 },
        { name: "Ariminum", lon: 13.32, lat: 44.56 }, // moved from its real site to give it room
        { name: "Capua", lon: 14.25, lat: 41.08 },
        { name: "Tarentum", lon: 17.24, lat: 40.47 },
        { name: "Croton", lon: 17.13, lat: 39.08 },
        { name: "Messana", lon: 15.55, lat: 38.19 },
      ],
    },
    {
      id: "carthage", name: "Carthage", shortName: "Carthage", color: "#7d4fb3", controller: "ai",
      cities: [
        { name: "Carthago", lon: 10.32, lat: 36.85, capital: true },
        { name: "Lilybaeum", lon: 12.44, lat: 37.8 },
        { name: "Thapsus", lon: 11.05, lat: 35.62 },
        { name: "Carales", lon: 9.11, lat: 39.22 },
        { name: "Palma", lon: 2.65, lat: 39.57 },
        { name: "Corduba", lon: -4.78, lat: 37.88 },
      ],
    },
    {
      id: "macedon", name: "Kingdom of Macedon", shortName: "Macedon", color: "#2e6fd1", controller: "ai",
      cities: [
        { name: "Pella", lon: 22.52, lat: 40.76, capital: true },
        { name: "Bylazora", lon: 21.77, lat: 41.72 },
      ],
    },
    {
      id: "greeks", name: "Greek Leagues", shortName: "Greeks", color: "#6fc8e8", controller: "ai",
      cities: [
        { name: "Corinthus", lon: 22.88, lat: 37.91, capital: true },
        { name: "Syracusae", lon: 15.29, lat: 37.07 },
        { name: "Sparta", lon: 22.68, lat: 36.07 }, // moved from its real site to give it room
        { name: "Pergamum", lon: 27.18, lat: 39.12 },
        { name: "Rhodos", lon: 27.22, lat: 35.93 }, // moved from its real site to give it room
      ],
    },
    {
      id: "seleucid", name: "Seleucid Empire", shortName: "Seleucids", color: "#e08a2c", controller: "ai",
      cities: [
        { name: "Antiochia", lon: 36.16, lat: 36.2, capital: true },
        { name: "Seleucia", lon: 40.6, lat: 35.1 }, // moved from its real site to give it room
        { name: "Damascus", lon: 36.29, lat: 33.51 },
        { name: "Sardis", lon: 28.04, lat: 38.49 },
        { name: "Tarsus", lon: 34.9, lat: 36.92 },
        { name: "Sidon", lon: 35.12, lat: 33.31 }, // moved from its real site to give it room
      ],
    },
    {
      id: "ptolemaic", name: "Ptolemaic Egypt", shortName: "Egypt", color: "#f0ead8", controller: "ai",
      cities: [
        { name: "Alexandria", lon: 29.92, lat: 31.2, capital: true },
        { name: "Memphis", lon: 30.75, lat: 30.85 }, // moved from its real site to give it room
        { name: "Salamis", lon: 33.9, lat: 35.18 },
        { name: "Cyrene", lon: 21.86, lat: 32.82 },
      ],
    },
    {
      id: "arverni", name: "Gallic Tribes", shortName: "Gauls", color: "#d6479b", controller: "ai",
      cities: [
        { name: "Alesia", lon: 4.5, lat: 47.54, capital: true },
        { name: "Lemonum", lon: 0.34, lat: 46.58 },
        { name: "Mediolanum", lon: 8.69, lat: 45.21 }, // moved from its real site to give it room
        { name: "Patavium", lon: 11.88, lat: 45.41 },
        { name: "Narbo Martius", lon: 3.0, lat: 43.18 },
        { name: "Numantia", lon: -2.44, lat: 41.8 },
      ],
    },
    {
      id: "numidia", name: "Kingdom of Numidia", shortName: "Numidia", color: "#e8c547", controller: "ai",
      cities: [
        { name: "Cirta", lon: 6.61, lat: 36.37, capital: true },
        { name: "Tingis", lon: -5.81, lat: 35.78 },
      ],
    },
    {
      id: "germani", name: "Germanic Tribes", shortName: "Germania", color: "#43b35a", controller: "ai",
      cities: [
        { name: "Batavodurum", lon: 5.86, lat: 51.84, capital: true },
        { name: "Damme", lon: 8.2, lat: 52.5 },
        { name: "Marcomannia", lon: 14.4, lat: 50.0 },
      ],
    },
    {
      id: "scythians", name: "Scythian Kingdom", shortName: "Scythia", color: "#1fb5a8", controller: "ai",
      cities: [
        { name: "Tanais", lon: 39.33, lat: 47.27, capital: true },
        { name: "Alania", lon: 40.3, lat: 45.3 },
        { name: "Sarmatia", lon: 35.8, lat: 47.6 },
      ],
    },
    {
      id: "thrace", name: "Odrysian Thrace", shortName: "Thrace", color: "#b89be6", controller: "ai",
      cities: [
        { name: "Tylis", lon: 27.0, lat: 42.7, capital: true },
        { name: "Getae", lon: 27.5, lat: 44.6 },
        { name: "Byzantion", lon: 28.97, lat: 41.01 },
      ],
    },
    {
      id: "celtiberians", name: "Iberian Tribes", shortName: "Spain", color: "#8e2a3c", controller: "ai",
      cities: [
        { name: "Asturica", lon: -6.05, lat: 42.46, capital: true },
        { name: "Carthago Nova", lon: -0.98, lat: 37.6 },
        { name: "Osca", lon: -0.41, lat: 42.14 },
      ],
    },
    {
      id: "britons", name: "Britons", shortName: "Britannia", color: "#4a5fc1", controller: "ai",
      cities: [
        { name: "Londinium", lon: -0.13, lat: 51.51, capital: true },
        { name: "Eburacum", lon: -1.08, lat: 53.96 },
        { name: "Deva", lon: -2.89, lat: 53.19 },
        { name: "Samarobriva", lon: 2.3, lat: 49.9 },
      ],
    },
    {
      id: "dacians", name: "Dacian Kingdom", shortName: "Dacia", color: "#d98c3a", controller: "ai",
      cities: [
        { name: "Porolissum", lon: 23.16, lat: 47.17, capital: true },
        { name: "Iazyges", lon: 20.2, lat: 46.6 },
      ],
    },
    {
      id: "pontus", name: "Kingdom of Pontus", shortName: "Pontus", color: "#8d5a3b", controller: "ai",
      cities: [
        { name: "Amaseia", lon: 35.83, lat: 40.65, capital: true },
        { name: "Sinope", lon: 35.15, lat: 42.03 },
        { name: "Trapezus", lon: 39.72, lat: 41.0 },
      ],
    },
  ],
};
