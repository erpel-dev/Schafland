// Pfand-Regeln (src/lib/pfand.js): Beträge, Open-Food-Facts-Angaben, Schätzung aus der Verpackung
import { test } from "node:test";
import assert from "node:assert/strict";
import { pfandCents, pfandAusOpenFacts, pfandVon, istGetraenk, pfandName, PFAND_ARTEN, PFAND_QUELLE } from "../../src/lib/pfand.js";

test("Beträge: Einweg fest 25 Cent, Mehrweg und Bier aus den Einstellungen", () => {
  assert.equal(pfandCents("einweg"), 25);
  assert.equal(pfandCents("einweg", { pfandMehrweg: 99 }), 25, "Einweg ist gesetzlich und nicht änderbar");
  assert.equal(pfandCents("mehrweg"), 15);
  assert.equal(pfandCents("bier"), 8);
  assert.equal(pfandCents("mehrweg", { pfandMehrweg: 20 }), 20);
  assert.equal(pfandCents("bier", { pfandBier: 10 }), 10);
  assert.equal(pfandCents("mehrweg", { pfandMehrweg: 0 }), 0, "0 ist erlaubt");
  assert.equal(pfandCents("kein"), 0);
  assert.equal(pfandCents(null), 0);
  assert.equal(pfandCents("gibt-es-nicht"), 0);
});

test("Beträge: kaputte Einstellungen fallen auf die üblichen Beträge zurück", () => {
  for (const kaputt of [undefined, null, -5, 1.5, 501, "15", NaN]) {
    assert.equal(pfandCents("mehrweg", { pfandMehrweg: kaputt }), 15, String(kaputt));
    assert.equal(pfandCents("bier", { pfandBier: kaputt }), 8, String(kaputt));
  }
  assert.equal(pfandCents("mehrweg", { pfandMehrweg: 500 }), 500, "Obergrenze gilt noch");
});

test("Namen und Herkunft: für alle Arten vorhanden", () => {
  assert.equal(pfandName("einweg"), "Einwegpfand");
  assert.equal(pfandName("mehrweg"), "Mehrwegpfand");
  assert.match(pfandName("bier"), /Mehrwegpfand/);
  assert.equal(pfandName("kein"), "kein Pfand");
  assert.equal(pfandName(null), "kein Pfand");
  assert.deepEqual(Object.keys(PFAND_ARTEN), ["einweg", "mehrweg", "bier"]);
  for (const q of ["siegel", "verpackung", "kategorie", "eigen", "kind", "eltern"]) assert.ok(PFAND_QUELLE[q], q);
});

test("Getränk erkennen: eigene Kategorie oder Kategorien von Open Food Facts", () => {
  assert.equal(istGetraenk({ categoryId: "getraenke" }), true);
  assert.equal(istGetraenk({ categoriesTags: ["en:plant-based-foods", "en:beverages"] }), true);
  assert.equal(istGetraenk({ categoriesTags: ["en:beers"] }), true);
  assert.equal(istGetraenk({ categoriesTags: ["en:milks"] }), true);
  assert.equal(istGetraenk({ categoryId: "suesses", categoriesTags: ["en:chocolates"] }), false);
  assert.equal(istGetraenk({ categoriesTags: ["en:beverages-and-beverages-preparations"] }), false, "nur ganze Tags");
  assert.equal(istGetraenk(), false);
});

const off = (p) => pfandAusOpenFacts(p);

test("Open Food Facts: Einwegpfand aus Siegel oder Verpackung", () => {
  assert.deepEqual(off({ labels_tags: ["de:einwegpfand"] }), { pfand: "einweg", pfandQuelle: "siegel" });
  assert.deepEqual(off({ packaging_tags: ["en:plastic", "de:einwegpfand"] }), { pfand: "einweg", pfandQuelle: "siegel" });
  assert.equal(off({ labels_tags: ["de:einweg-pfand"] }).pfand, "einweg");
  assert.equal(off({ labels_tags: ["de:pfandpflichtig"] }).pfand, "einweg");
  assert.equal(off({ labels_tags: ["DE:EINWEGPFAND"] }).pfand, "einweg", "Groß-/Kleinschreibung egal");
  // Siegel gilt auch ohne Getränke-Kategorie
  assert.equal(off({ labels_tags: ["de:einwegpfand"], categories_tags: ["en:snacks"] }).pfand, "einweg");
});

test("Open Food Facts: Mehrweg; Bier hat eigenen Betrag", () => {
  assert.deepEqual(off({ labels_tags: ["de:mehrweg"] }), { pfand: "mehrweg", pfandQuelle: "siegel" });
  assert.equal(off({ packaging_tags: ["de:mehrwegpfand"] }).pfand, "mehrweg");
  assert.equal(off({ labels_tags: ["en:returnable"] }).pfand, "mehrweg");
  assert.equal(off({ labels_tags: ["de:mehrweg"], categories_tags: ["en:beverages", "en:beers"] }).pfand, "bier");
});

test("Open Food Facts: ausdrücklich ohne Pfand", () => {
  assert.deepEqual(off({ labels_tags: ["de:kein-pfand"], categories_tags: ["en:beverages"] }), { pfand: "kein", pfandQuelle: "siegel" });
  assert.equal(off({ labels_tags: ["de:pfandfrei"], packaging_tags: ["en:can"], categories_tags: ["en:sodas"] }).pfand, "kein");
});

test("kein Getränk und keine Pfand-Angabe: kein Pfand", () => {
  assert.deepEqual(off({ categories_tags: ["en:chocolates"], packaging_tags: ["en:plastic-bottle"] }), { pfand: "kein", pfandQuelle: "kategorie" });
  assert.equal(off({ packaging_tags: ["en:food-can"], categories_tags: ["en:canned-vegetables"] }).pfand, "kein");
});

test("Getränk ohne Angabe: aus der Verpackung geschätzt", () => {
  const drink = (packaging_tags, extra = {}) => off({ categories_tags: ["en:beverages", ...(extra.cats ?? [])], packaging_tags, ...extra.p });
  assert.deepEqual(drink(["en:can"]), { pfand: "einweg", pfandQuelle: "verpackung" });
  assert.equal(drink(["de:dose-n"]).pfand, "einweg");
  assert.equal(drink(["en:aluminium-can"]).pfand, "einweg");
  assert.equal(drink(["de:pet-flasche"]).pfand, "einweg");
  assert.equal(drink(["en:plastic-bottle"]).pfand, "einweg");
  assert.equal(drink(["en:bottle", "en:pet-1-polyethylene-terephthalate"]).pfand, "einweg", "Flasche + Kunststoff");
  assert.equal(off({ categories_tags: ["en:waters"], packaging_shapes_tags: ["en:bottle"], packaging_materials_tags: ["en:plastic"] }).pfand, "einweg");
  // Kartons haben kein Pfand, auch wenn „Flasche“ o. Ä. dabeisteht
  assert.deepEqual(drink(["en:tetra-pak", "en:plastic"]), { pfand: "kein", pfandQuelle: "verpackung" });
  assert.equal(drink(["de:getrankekarton"]).pfand, "kein");
  // Glas: Bier geschätzt, sonst unbekannt (Saft und Wein in Glas haben oft kein Pfand)
  assert.deepEqual(drink(["de:glasflasche"], { cats: ["en:beers"] }), { pfand: "bier", pfandQuelle: "verpackung" });
  assert.deepEqual(drink(["de:glasflasche"]), { pfand: null, pfandQuelle: null });
  assert.deepEqual(drink([]), { pfand: null, pfandQuelle: null });
  // Konservendose zählt nicht als Getränkedose
  assert.equal(drink(["en:food-can"]).pfand, null);
  // Wörter, die nur „can“ enthalten, sind keine Dose
  assert.equal(drink(["en:candy-wrapper"]).pfand, null);
});

test("eigene Kategorie reicht als Getränk (Produkt ohne Kategorien bei Open Food Facts)", () => {
  assert.equal(pfandAusOpenFacts({ packaging_tags: ["en:can"] }, { categoryId: "getraenke" }).pfand, "einweg");
  assert.equal(pfandAusOpenFacts({ packaging_tags: ["en:can"] }, { categoryId: "suesses" }).pfand, "kein");
});

test("Pfand eines Produkts: gespeicherte Angabe, ältere Scans, eigenes Sortiment", () => {
  assert.deepEqual(pfandVon({ pfand: "einweg", pfandQuelle: "siegel" }), { pfand: "einweg", pfandQuelle: "siegel" });
  assert.deepEqual(pfandVon({ pfand: null, pfandQuelle: null, categoryId: "getraenke" }), { pfand: null, pfandQuelle: null });
  assert.deepEqual(pfandVon({ pfand: "kein", source: "eigen" }), { pfand: "kein", pfandQuelle: "eigen" });
  // ältere Scans ohne Pfand-Feld
  assert.deepEqual(pfandVon({ categoryId: "getraenke" }), { pfand: null, pfandQuelle: null });
  assert.deepEqual(pfandVon({ categoryId: "suesses" }), { pfand: "kein", pfandQuelle: "kategorie" });
  assert.deepEqual(pfandVon(null), { pfand: null, pfandQuelle: null });
});

test("ohne Kategorien bei Open Food Facts: fragen statt ablehnen", () => {
  assert.deepEqual(off({}), { pfand: null, pfandQuelle: null });
  assert.deepEqual(off({ packaging_tags: ["en:bottle"] }), { pfand: null, pfandQuelle: null });
  assert.equal(pfandAusOpenFacts({}, { categoryId: "gescannt" }).pfand, null);
  // Siegel gilt trotzdem
  assert.equal(off({ labels_tags: ["de:einwegpfand"] }).pfand, "einweg");
  // ältere Scans ohne Kategorie
  assert.equal(pfandVon({ categoryId: "gescannt" }).pfand, null);
  assert.equal(pfandVon({}).pfand, null);
});

test("Bestandteile (packagings): Form und Material derselben Verpackung", () => {
  const drink = (packagings, cats = []) => off({ categories_tags: ["en:beverages", ...cats], packagings });
  // Glasflasche mit Kunststoffdeckel ist keine Plastikflasche
  assert.deepEqual(drink([{ shape: "en:bottle", material: "en:glass" }, { shape: "en:cap", material: "en:plastic" }]), { pfand: null, pfandQuelle: null });
  assert.equal(drink([{ shape: "en:bottle", material: "en:glass" }, { shape: "en:cap", material: "en:metal" }], ["en:beers"]).pfand, "bier");
  assert.deepEqual(drink([{ shape: "en:bottle", material: "en:pet-1-polyethylene-terephthalate" }, { shape: "en:cap", material: "en:hdpe-2-high-density-polyethylene" }]), { pfand: "einweg", pfandQuelle: "verpackung" });
  // API v3: Objekte mit id
  assert.equal(drink([{ shape: { id: "en:bottle" }, material: { id: "en:plastic" } }]).pfand, "einweg");
  assert.equal(drink([{ shape: "en:drink-can", material: "en:aluminium" }]).pfand, "einweg");
  assert.equal(drink([{ shape: "en:brick", material: "en:multilayer-composite" }, { shape: "en:cap", material: "en:plastic" }]).pfand, "kein");
  // Flasche ohne Material, oder gemischte Flaschen: fragen
  assert.equal(drink([{ shape: "en:bottle" }]).pfand, null);
  assert.equal(drink([{ shape: "en:bottle", material: "en:glass" }, { shape: "en:bottle", material: "en:plastic" }]).pfand, null);
  // Bestandteile gehen den zusammengefassten Tags vor
  assert.equal(off({ categories_tags: ["en:beverages"], packaging_tags: ["en:bottle", "en:plastic"], packagings: [{ shape: "en:bottle", material: "en:glass" }, { shape: "en:cap", material: "en:plastic" }] }).pfand, null);
});

test("zusammengefasste Tags: bei Glas und Kunststoff zugleich fragen; Dosen im Karton sind Einweg", () => {
  const drink = (packaging_tags, cats = []) => off({ categories_tags: ["en:beverages", ...cats], packaging_tags });
  assert.equal(drink(["en:bottle", "en:glass", "en:plastic"]).pfand, null);
  assert.equal(drink(["en:bottle", "en:glass", "en:metal"], ["en:beers"]).pfand, "bier");
  assert.equal(drink(["en:can", "en:cardboard-box", "de:karton"]).pfand, "einweg");
});

test("Verneinte Angaben: „non-returnable“ ist kein Mehrweg, „kein Einwegpfand“ ist kein Pfand", () => {
  const drink = (labels_tags, packaging_tags = []) => off({ categories_tags: ["en:beverages", "en:juices"], labels_tags, packaging_tags });
  assert.equal(drink(["en:non-returnable"]).pfand, null, "Glas o. Ä. unbekannt: fragen");
  assert.equal(drink(["en:non-returnable"], ["en:can"]).pfand, "einweg", "Dose bleibt Einweg");
  assert.equal(drink(["de:nicht-mehrweg"]).pfand, null);
  assert.equal(drink(["de:kein-einwegpfand"], ["en:can"]).pfand, "kein");
  assert.equal(drink(["de:ohne-pfand"]).pfand, "kein");
  assert.equal(drink(["en:returnable"]).pfand, "mehrweg", "ohne Verneinung weiter Mehrweg");
});

test("Flaschendeckel und Etiketten sind keine Behälter", () => {
  const drink = (extra) => off({ categories_tags: ["en:beverages"], ...extra });
  // Tetrapak mit „bottle-cap“: kein Pfand, nicht Plastikflasche
  assert.equal(drink({ packaging_tags: ["en:tetra-pak", "en:bottle-cap", "en:plastic"] }).pfand, "kein");
  assert.equal(drink({ packagings: [{ shape: "en:brick", material: "en:multilayer-composite" }, { shape: "en:bottle-cap", material: "en:plastic" }] }).pfand, "kein");
  assert.equal(drink({ packagings: [{ shape: "en:jar", material: "en:glass" }, { shape: "en:can-lid", material: "en:metal" }] }).pfand, null);
  assert.equal(drink({ packaging_tags: ["de:flaschendeckel", "en:plastic"] }).pfand, null);
});

test("Getränke-Pulver, Kaffee, Tee, Sirup und Kondensmilch: kein Pfand, auch in Dose", () => {
  const p = (cats, packaging_tags = ["en:can"]) => off({ categories_tags: cats, packaging_tags });
  assert.equal(p(["en:beverages", "en:coffees", "en:ground-coffees"]).pfand, "kein", "Kaffee in der Dose");
  assert.equal(p(["en:beverages", "en:cocoa-and-chocolate-powders"]).pfand, "kein");
  assert.equal(p(["en:beverages", "en:teas", "en:green-teas"]).pfand, "kein");
  assert.equal(p(["en:beverages", "en:syrups"], ["en:bottle", "en:plastic"]).pfand, "kein");
  assert.equal(p(["en:dairies", "en:milks", "en:condensed-milks"]).pfand, "kein");
  // eindeutiges Getränk gewinnt (Eistee ist auch „Tee“)
  assert.equal(p(["en:beverages", "en:teas", "en:iced-teas"]).pfand, "einweg");
  assert.equal(p(["en:dairies", "en:milks"], ["en:bottle", "en:plastic"]).pfand, "einweg", "Milch in Plastikflasche: Einwegpfand seit 2024");
  assert.equal(istGetraenk({ categoriesTags: ["en:beverages", "en:coffees"] }), false);
  assert.equal(istGetraenk({ categoriesTags: ["en:alcoholic-beverages", "en:spirits"] }), true);
});

test("Teile-Erkennung greift nicht bei Behältern mit ähnlichen Namen", () => {
  const drink = (packaging_tags) => off({ categories_tags: ["en:beverages"], packaging_tags });
  assert.equal(drink(["en:tetra-top"]).pfand, "kein", "Tetra Top ist ein Karton");
  assert.equal(drink(["en:ring-pull-can"]).pfand, "einweg");
  assert.equal(drink(["en:sealed-bottle", "en:pet"]).pfand, "einweg");
});

test("Regal-Kategorie „getraenke“ überstimmt die genauen Kategorien nicht", () => {
  assert.equal(istGetraenk({ categoryId: "getraenke", categoriesTags: ["en:beverages", "en:coffees"] }), false);
  assert.equal(istGetraenk({ categoryId: "getraenke" }), true, "ohne Kategorien zählt die Regal-Kategorie");
  assert.equal(pfandAusOpenFacts({ categories_tags: ["en:beverages", "en:coffees"], packaging_tags: ["en:can"] }, { categoryId: "getraenke" }).pfand, "kein");
});
