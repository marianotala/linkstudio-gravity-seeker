// Las 20 categorías de Seeker + búsqueda "solo por nombre".
// types: tipos de Places API (New) para searchNearby (modo orígenes).
// textQuery: consulta en español para searchText (modo zona).

export interface Categoria {
  key: string;
  label: string;
  types: string[];
  textQuery: string;
}

export const SOLO_NOMBRE = "solo_nombre";

export const CATEGORIAS: Categoria[] = [
  { key: "conveniencia", label: "Tiendas de conveniencia", types: ["convenience_store"], textQuery: "tiendas de conveniencia" },
  { key: "supermercados", label: "Supermercados", types: ["supermarket", "grocery_store"], textQuery: "supermercados" },
  { key: "farmacias", label: "Farmacias", types: ["pharmacy", "drugstore"], textQuery: "farmacias" },
  { key: "restaurantes", label: "Restaurantes", types: ["restaurant"], textQuery: "restaurantes" },
  { key: "cafeterias", label: "Cafeterías", types: ["cafe", "coffee_shop"], textQuery: "cafeterías" },
  { key: "comida_rapida", label: "Comida rápida", types: ["fast_food_restaurant"], textQuery: "comida rápida" },
  { key: "bancos", label: "Bancos y cajeros", types: ["bank", "atm"], textQuery: "bancos" },
  { key: "gasolineras", label: "Gasolineras", types: ["gas_station"], textQuery: "gasolineras" },
  { key: "gimnasios", label: "Gimnasios", types: ["gym", "fitness_center"], textQuery: "gimnasios" },
  { key: "hospitales", label: "Hospitales y clínicas", types: ["hospital"], textQuery: "hospitales" },
  { key: "escuelas", label: "Escuelas y universidades", types: ["school", "university"], textQuery: "escuelas y universidades" },
  { key: "centros_comerciales", label: "Centros comerciales", types: ["shopping_mall"], textQuery: "centros comerciales" },
  { key: "departamentales", label: "Tiendas departamentales", types: ["department_store"], textQuery: "tiendas departamentales" },
  { key: "ferreterias", label: "Ferreterías", types: ["hardware_store"], textQuery: "ferreterías" },
  { key: "autolavados", label: "Autolavados", types: ["car_wash"], textQuery: "autolavados" },
  { key: "refaccionarias", label: "Refaccionarias", types: ["auto_parts_store"], textQuery: "refaccionarias" },
  { key: "veterinarias", label: "Veterinarias y mascotas", types: ["veterinary_care", "pet_store"], textQuery: "veterinarias" },
  { key: "hoteles", label: "Hoteles", types: ["hotel", "lodging"], textQuery: "hoteles" },
  { key: "bares", label: "Bares y antros", types: ["bar", "night_club"], textQuery: "bares" },
  { key: "panaderias", label: "Panaderías", types: ["bakery"], textQuery: "panaderías" },
];

export function getCategoria(key: string): Categoria | undefined {
  return CATEGORIAS.find((c) => c.key === key);
}
