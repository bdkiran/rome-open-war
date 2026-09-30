import type { Scenario } from "@/data/scenarios/types.js";
import { europeMapEngine } from "@/map/europe/europeMapEngine.js";

/**
 * 218 BC, the outbreak of the Second Punic War. Rome and Carthage are about
 * to go to war, the Hellenistic kingdoms rule the east, the Gauls hold the
 * lands beyond the Alps, the Germanic tribes the forests of the north, the
 * Numidians the coast west of Carthage, Thrace and Pontus the approaches to
 * the Black Sea, and the Scythians its northern shore.
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
        { name: "Ariminum", lon: 12.57, lat: 44.06 },
        { name: "Tarentum", lon: 17.24, lat: 40.47 },
        { name: "Syracusae", lon: 15.29, lat: 37.07 },
      ],
    },
    {
      id: "carthage", name: "Carthage", shortName: "Carthage", color: "#7d4fb3", controller: "ai",
      cities: [
        { name: "Carthago", lon: 10.32, lat: 36.85, capital: true },
        { name: "Carthago Nova", lon: -0.98, lat: 37.6 },
        { name: "Lilybaeum", lon: 12.44, lat: 37.8 },
      ],
    },
    {
      id: "macedon", name: "Kingdom of Macedon", shortName: "Macedon", color: "#2e6fd1", controller: "ai",
      cities: [
        { name: "Pella", lon: 22.52, lat: 40.76, capital: true },
        { name: "Demetrias", lon: 22.94, lat: 39.35 },
        { name: "Corinthus", lon: 22.88, lat: 37.91 },
      ],
    },
    {
      id: "seleucid", name: "Seleucid Empire", shortName: "Seleucids", color: "#e08a2c", controller: "ai",
      cities: [
        { name: "Antiochia", lon: 36.16, lat: 36.2, capital: true },
        { name: "Tarsus", lon: 34.9, lat: 36.92 },
        { name: "Sardis", lon: 28.04, lat: 38.49 },
      ],
    },
    {
      id: "ptolemaic", name: "Ptolemaic Egypt", shortName: "Egypt", color: "#f0ead8", controller: "ai",
      cities: [
        { name: "Alexandria", lon: 29.92, lat: 31.2, capital: true },
        { name: "Memphis", lon: 31.25, lat: 29.85 },
        { name: "Cyrene", lon: 21.86, lat: 32.82 },
      ],
    },
    {
      id: "arverni", name: "Arverni Confederation", shortName: "Arverni", color: "#d6479b", controller: "ai",
      cities: [
        { name: "Gergovia", lon: 3.12, lat: 45.71, capital: true },
        { name: "Lutetia", lon: 2.35, lat: 48.86 },
        { name: "Tolosa", lon: 1.44, lat: 43.6 },
      ],
    },
    {
      id: "numidia", name: "Kingdom of Numidia", shortName: "Numidia", color: "#e8c547", controller: "ai",
      cities: [
        { name: "Cirta", lon: 6.61, lat: 36.37, capital: true },
        { name: "Siga", lon: -1.47, lat: 35.3 },
        { name: "Iol", lon: 2.2, lat: 36.6 },
      ],
    },
    {
      id: "germani", name: "Germanic Tribes", shortName: "Germani", color: "#43b35a", controller: "ai",
      cities: [
        { name: "Lupfurdum", lon: 13.7, lat: 51.05, capital: true },
        { name: "Treva", lon: 10.0, lat: 53.55 },
        { name: "Budorigum", lon: 17.03, lat: 51.1 },
      ],
    },
    {
      id: "scythians", name: "Scythian Kingdom", shortName: "Scythians", color: "#1fb5a8", controller: "ai",
      cities: [
        { name: "Neapolis Scythica", lon: 34.1, lat: 44.95, capital: true },
        { name: "Olbia", lon: 31.9, lat: 46.7 },
        { name: "Tanais", lon: 39.33, lat: 47.27 },
      ],
    },
    {
      id: "thrace", name: "Odrysian Thrace", shortName: "Thrace", color: "#b89be6", controller: "ai",
      cities: [
        { name: "Seuthopolis", lon: 25.3, lat: 42.6, capital: true },
        { name: "Odessos", lon: 27.9, lat: 43.2 },
        { name: "Byzantion", lon: 28.97, lat: 41.01 },
      ],
    },
    {
      id: "celtiberians", name: "Celtiberian Confederation", shortName: "Celtiberians", color: "#8e2a3c", controller: "ai",
      cities: [
        { name: "Numantia", lon: -2.44, lat: 41.8, capital: true },
        { name: "Toletum", lon: -4.02, lat: 39.86 },
        { name: "Olisipo", lon: -9.14, lat: 38.72 },
      ],
    },
    {
      id: "britons", name: "Britons", shortName: "Britons", color: "#4a5fc1", controller: "ai",
      cities: [
        { name: "Camulodunon", lon: 0.9, lat: 51.89, capital: true },
        { name: "Durnovaria", lon: -2.44, lat: 50.71 },
        { name: "Isurium", lon: -1.38, lat: 54.09 },
      ],
    },
    {
      id: "dacians", name: "Dacian Kingdom", shortName: "Dacians", color: "#d98c3a", controller: "ai",
      cities: [
        { name: "Sarmizegetusa", lon: 23.31, lat: 45.62, capital: true },
        { name: "Porolissum", lon: 23.16, lat: 47.17 },
        { name: "Piroboridava", lon: 27.25, lat: 45.95 },
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
