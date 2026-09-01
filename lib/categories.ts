// Las categorías de Seeker + búsqueda "solo por nombre".
// types: tipos de Places API (New) para searchNearby (modo orígenes);
//        si está vacío, esa categoría se busca con searchText.
// textQuery: consulta en español para searchText (modo zona).
// denue: condición de búsqueda para la API de DENUE (INEGI) — busca en
//        nombre, razón social y clase de actividad SCIAN.
// grupo: encabezado del dropdown (con ~37 categorías la lista plana
//        era ilegible).
//
// EXCLUSIVIDAD entre categorías cercanas (tipos de Google y términos
// DENUE que no se pisan):
//   AUTOMOTRIZ  · agencias (car_dealer / automóviles nuevos)
//               · talleres (car_repair / reparación mecánica)
//               · refaccionarias (auto_parts_store / refacciones)
//               · autolavados (car_wash / lavado de autos)
//   RETAIL      · clubes de precio (warehouse_store) vs supermercados
//                 (supermarket, grocery_store)
//               · telefonía (cell_phone_store) vs mueblerías/electro
//                 (furniture_store, electronics_store)

export interface Categoria {
  key: string;
  label: string;
  types: string[];
  textQuery: string;
  denue: string;
  grupo: string;
}

export const SOLO_NOMBRE = "solo_nombre";

const G_ALIMENTOS = "Alimentos y bebidas";
const G_RETAIL = "Retail";
const G_SALUD = "Salud y bienestar";
const G_AUTO = "Automotriz";
const G_SERVICIOS = "Servicios";
const G_ENTRETENIMIENTO = "Entretenimiento y afinidad";

export const CATEGORIAS: Categoria[] = [
  // ---- alimentos y bebidas ----
  { key: "supermercados", label: "Supermercados", types: ["supermarket", "grocery_store"], textQuery: "supermercados", denue: "supermercado", grupo: G_ALIMENTOS },
  { key: "restaurantes", label: "Restaurantes", types: ["restaurant"], textQuery: "restaurantes", denue: "restaurante", grupo: G_ALIMENTOS },
  { key: "cafeterias", label: "Cafeterías", types: ["cafe", "coffee_shop"], textQuery: "cafeterías", denue: "cafeteria", grupo: G_ALIMENTOS },
  { key: "comida_rapida", label: "Comida rápida", types: ["fast_food_restaurant"], textQuery: "comida rápida", denue: "comida rapida", grupo: G_ALIMENTOS },
  { key: "panaderias", label: "Panaderías", types: ["bakery"], textQuery: "panaderías", denue: "panaderia", grupo: G_ALIMENTOS },
  { key: "tortillerias", label: "Tortillerías", types: [], textQuery: "tortillerías", denue: "tortilleria", grupo: G_ALIMENTOS },
  { key: "carnicerias", label: "Carnicerías", types: [], textQuery: "carnicerías", denue: "carniceria", grupo: G_ALIMENTOS },
  { key: "vinaterias", label: "Vinaterías y licorerías", types: ["liquor_store"], textQuery: "vinaterías y licorerías", denue: "vinos y licores", grupo: G_ALIMENTOS },
  { key: "abarrotes", label: "Abarrotes y misceláneas", types: [], textQuery: "tiendas de abarrotes", denue: "abarrotes", grupo: G_ALIMENTOS },
  // ---- retail ----
  { key: "conveniencia", label: "Tiendas de conveniencia", types: ["convenience_store"], textQuery: "tiendas de conveniencia", denue: "conveniencia", grupo: G_RETAIL },
  { key: "departamentales", label: "Tiendas departamentales", types: ["department_store"], textQuery: "tiendas departamentales", denue: "tienda departamental", grupo: G_RETAIL },
  { key: "clubes_precio", label: "Clubes de precio", types: ["warehouse_store"], textQuery: "clubes de precio con membresía", denue: "club de precios", grupo: G_RETAIL },
  { key: "muebles_electro", label: "Mueblerías y electrodomésticos", types: ["furniture_store", "electronics_store"], textQuery: "mueblerías y tiendas de electrodomésticos", denue: "muebles", grupo: G_RETAIL },
  { key: "ropa_moda", label: "Tiendas de ropa y moda", types: ["clothing_store"], textQuery: "tiendas de ropa", denue: "ropa", grupo: G_RETAIL },
  { key: "deportivas", label: "Tiendas deportivas", types: ["sporting_goods_store"], textQuery: "tiendas de artículos deportivos", denue: "articulos deportivos", grupo: G_RETAIL },
  { key: "papelerias", label: "Papelerías", types: [], textQuery: "papelerías", denue: "papeleria", grupo: G_RETAIL },
  { key: "ferreterias", label: "Ferreterías", types: ["hardware_store"], textQuery: "ferreterías", denue: "ferreteria", grupo: G_RETAIL },
  { key: "opticas", label: "Ópticas", types: [], textQuery: "ópticas", denue: "optica", grupo: G_RETAIL },
  // ---- salud y bienestar ----
  { key: "farmacias", label: "Farmacias", types: ["pharmacy", "drugstore"], textQuery: "farmacias", denue: "farmacia", grupo: G_SALUD },
  { key: "hospitales", label: "Hospitales y clínicas", types: ["hospital"], textQuery: "hospitales", denue: "hospital", grupo: G_SALUD },
  { key: "gimnasios", label: "Gimnasios", types: ["gym", "fitness_center"], textQuery: "gimnasios", denue: "gimnasio", grupo: G_SALUD },
  { key: "esteticas", label: "Estéticas y peluquerías", types: ["beauty_salon", "hair_salon"], textQuery: "estéticas", denue: "estetica", grupo: G_SALUD },
  { key: "veterinarias", label: "Veterinarias y mascotas", types: ["veterinary_care", "pet_store"], textQuery: "veterinarias", denue: "veterinaria", grupo: G_SALUD },
  // ---- automotriz ----
  { key: "agencias_autos", label: "Agencias de autos", types: ["car_dealer"], textQuery: "agencias de autos nuevos", denue: "automoviles nuevos", grupo: G_AUTO },
  { key: "talleres_mecanicos", label: "Talleres mecánicos", types: ["car_repair"], textQuery: "talleres mecánicos", denue: "reparacion mecanica", grupo: G_AUTO },
  { key: "refaccionarias", label: "Refaccionarias", types: ["auto_parts_store"], textQuery: "refaccionarias", denue: "refacciones", grupo: G_AUTO },
  { key: "autolavados", label: "Autolavados", types: ["car_wash"], textQuery: "autolavados", denue: "lavado de autos", grupo: G_AUTO },
  { key: "gasolineras", label: "Gasolineras", types: ["gas_station"], textQuery: "gasolineras", denue: "gasolina", grupo: G_AUTO },
  // ---- servicios ----
  { key: "bancos", label: "Bancos y cajeros", types: ["bank", "atm"], textQuery: "bancos", denue: "banca multiple", grupo: G_SERVICIOS },
  { key: "empeno", label: "Casas de empeño y préstamos", types: [], textQuery: "casas de empeño", denue: "empeno", grupo: G_SERVICIOS },
  { key: "telefonia", label: "Tiendas de telefonía", types: ["cell_phone_store"], textQuery: "tiendas de telefonía celular", denue: "telefonos", grupo: G_SERVICIOS },
  { key: "hoteles", label: "Hoteles", types: ["hotel", "lodging"], textQuery: "hoteles", denue: "hotel", grupo: G_SERVICIOS },
  { key: "escuelas", label: "Escuelas y universidades", types: ["school", "university"], textQuery: "escuelas y universidades", denue: "escuela", grupo: G_SERVICIOS },
  // ---- entretenimiento y afinidad ----
  { key: "cines", label: "Cines", types: ["movie_theater"], textQuery: "cines", denue: "cine", grupo: G_ENTRETENIMIENTO },
  { key: "estadios", label: "Estadios y arenas", types: ["stadium"], textQuery: "estadios y arenas", denue: "estadio", grupo: G_ENTRETENIMIENTO },
  { key: "bares", label: "Bares y antros", types: ["bar", "night_club"], textQuery: "bares", denue: "bar", grupo: G_ENTRETENIMIENTO },
  { key: "centros_comerciales", label: "Centros comerciales", types: ["shopping_mall"], textQuery: "centros comerciales", denue: "centro comercial", grupo: G_ENTRETENIMIENTO },
];

/** Grupos en el orden del dropdown, con sus categorías en orden. */
export const GRUPOS_CATEGORIAS: { nombre: string; categorias: Categoria[] }[] =
  [
    G_ALIMENTOS,
    G_RETAIL,
    G_SALUD,
    G_AUTO,
    G_SERVICIOS,
    G_ENTRETENIMIENTO,
  ].map((nombre) => ({
    nombre,
    categorias: CATEGORIAS.filter((c) => c.grupo === nombre),
  }));

export function getCategoria(key: string): Categoria | undefined {
  return CATEGORIAS.find((c) => c.key === key);
}
