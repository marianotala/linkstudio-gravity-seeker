// Las categorías de Seeker + búsqueda "solo por nombre".
// types: tipos de Places API (New) para searchNearby (modo orígenes);
//        si está vacío, esa categoría se busca con searchText.
// textQuery: consulta en español para searchText (modo zona).
// denue: condición de búsqueda para la API de DENUE (INEGI) — busca en
//        nombre, razón social y clase de actividad SCIAN.

export interface Categoria {
  key: string;
  label: string;
  types: string[];
  textQuery: string;
  denue: string;
}

export const SOLO_NOMBRE = "solo_nombre";

export const CATEGORIAS: Categoria[] = [
  { key: "conveniencia", label: "Tiendas de conveniencia", types: ["convenience_store"], textQuery: "tiendas de conveniencia", denue: "conveniencia" },
  { key: "supermercados", label: "Supermercados", types: ["supermarket", "grocery_store"], textQuery: "supermercados", denue: "supermercado" },
  { key: "farmacias", label: "Farmacias", types: ["pharmacy", "drugstore"], textQuery: "farmacias", denue: "farmacia" },
  { key: "restaurantes", label: "Restaurantes", types: ["restaurant"], textQuery: "restaurantes", denue: "restaurante" },
  { key: "cafeterias", label: "Cafeterías", types: ["cafe", "coffee_shop"], textQuery: "cafeterías", denue: "cafeteria" },
  { key: "comida_rapida", label: "Comida rápida", types: ["fast_food_restaurant"], textQuery: "comida rápida", denue: "comida rapida" },
  { key: "bancos", label: "Bancos y cajeros", types: ["bank", "atm"], textQuery: "bancos", denue: "banca multiple" },
  { key: "gasolineras", label: "Gasolineras", types: ["gas_station"], textQuery: "gasolineras", denue: "gasolina" },
  { key: "gimnasios", label: "Gimnasios", types: ["gym", "fitness_center"], textQuery: "gimnasios", denue: "gimnasio" },
  { key: "hospitales", label: "Hospitales y clínicas", types: ["hospital"], textQuery: "hospitales", denue: "hospital" },
  { key: "escuelas", label: "Escuelas y universidades", types: ["school", "university"], textQuery: "escuelas y universidades", denue: "escuela" },
  { key: "centros_comerciales", label: "Centros comerciales", types: ["shopping_mall"], textQuery: "centros comerciales", denue: "centro comercial" },
  { key: "departamentales", label: "Tiendas departamentales", types: ["department_store"], textQuery: "tiendas departamentales", denue: "tienda departamental" },
  { key: "ferreterias", label: "Ferreterías", types: ["hardware_store"], textQuery: "ferreterías", denue: "ferreteria" },
  { key: "autolavados", label: "Autolavados", types: ["car_wash"], textQuery: "autolavados", denue: "lavado de autos" },
  { key: "refaccionarias", label: "Refaccionarias", types: ["auto_parts_store"], textQuery: "refaccionarias", denue: "refacciones" },
  { key: "veterinarias", label: "Veterinarias y mascotas", types: ["veterinary_care", "pet_store"], textQuery: "veterinarias", denue: "veterinaria" },
  { key: "hoteles", label: "Hoteles", types: ["hotel", "lodging"], textQuery: "hoteles", denue: "hotel" },
  { key: "bares", label: "Bares y antros", types: ["bar", "night_club"], textQuery: "bares", denue: "bar" },
  { key: "panaderias", label: "Panaderías", types: ["bakery"], textQuery: "panaderías", denue: "panaderia" },
  // ---- canal tradicional (DENUE lo cubre mucho mejor que Google) ----
  { key: "abarrotes", label: "Abarrotes y misceláneas", types: [], textQuery: "tiendas de abarrotes", denue: "abarrotes" },
  { key: "tortillerias", label: "Tortillerías", types: [], textQuery: "tortillerías", denue: "tortilleria" },
  { key: "papelerias", label: "Papelerías", types: [], textQuery: "papelerías", denue: "papeleria" },
  { key: "esteticas", label: "Estéticas y peluquerías", types: ["beauty_salon", "hair_salon"], textQuery: "estéticas", denue: "estetica" },
  { key: "carnicerias", label: "Carnicerías", types: [], textQuery: "carnicerías", denue: "carniceria" },
];

export function getCategoria(key: string): Categoria | undefined {
  return CATEGORIAS.find((c) => c.key === key);
}
