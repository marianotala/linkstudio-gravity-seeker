// El CATÁLOGO CURADO de categorías de Seeker + búsqueda "solo por
// nombre" + búsqueda LIBRE (texto sin match curado).
// types: tipos de Places API (New) para searchNearby (modo orígenes);
//        si está vacío, esa categoría se busca con searchText.
// textQuery: consulta en español para searchText (modo zona).
// denue: condición de búsqueda para la API de DENUE (INEGI) — busca en
//        nombre, razón social y clase de actividad SCIAN.
// sinonimos: alias EDITABLES para el autocompletado ("coches" →
//        Agencias de autos); minúsculas, sin acentos.
// grupo: encabezado para agrupar sugerencias.
//
// EXCLUSIVIDAD entre categorías cercanas (ningún tipo de Google se
// comparte entre dos categorías y ningún término DENUE se repite —
// hay prueba automática):
//   clubes de precio (warehouse_store) ≠ supermercados
//   agencias (car_dealer) ≠ seminuevos ≠ talleres (car_repair)
//   mueblerías (furniture_store) ≠ electrodomésticos (home_goods) ≠
//     electrónica (electronics_store)
//   bancos (bank) ≠ cajeros (atm) · hoteles (hotel) ≠ moteles (motel)
//   restaurantes (amplia) vs taquerías/marisquerías/pizzerías
//     (específicas, con su propio tipo o término)

export interface Categoria {
  key: string;
  label: string;
  types: string[];
  textQuery: string;
  denue: string;
  sinonimos: string[];
  grupo: string;
}

export const SOLO_NOMBRE = "solo_nombre";
/** Búsqueda LIBRE: el texto va como query a Google Places y como
 * palabra clave de actividad a DENUE (sin mapeo curado). */
export const CATEGORIA_LIBRE = "categoria_libre";

const G_ALIMENTOS = "Alimentos y bebidas";
const G_RETAIL = "Retail";
const G_SALUD = "Salud y bienestar";
const G_AUTO = "Automotriz";
const G_FINANZAS = "Servicios financieros";
const G_SERVICIOS = "Servicios y B2B";
const G_EDUCACION = "Educación";
const G_ENTRETENIMIENTO = "Entretenimiento y afinidad";

export const CATEGORIAS: Categoria[] = [
  // ---- alimentos y bebidas ----
  { key: "supermercados", label: "Supermercados", types: ["supermarket", "grocery_store"], textQuery: "supermercados", denue: "supermercado", sinonimos: ["super", "autoservicio", "walmart", "soriana", "chedraui"], grupo: G_ALIMENTOS },
  { key: "clubes_precio", label: "Clubes de precio", types: ["warehouse_store"], textQuery: "clubes de precio con membresía", denue: "club de precios", sinonimos: ["costco", "sams", "city club", "membresia", "mayoreo"], grupo: G_ALIMENTOS },
  { key: "restaurantes", label: "Restaurantes", types: ["restaurant"], textQuery: "restaurantes", denue: "restaurante", sinonimos: ["comida", "restoran"], grupo: G_ALIMENTOS },
  { key: "marisquerias", label: "Marisquerías", types: ["seafood_restaurant"], textQuery: "marisquerías", denue: "marisqueria", sinonimos: ["mariscos", "pescados"], grupo: G_ALIMENTOS },
  { key: "taquerias", label: "Taquerías", types: [], textQuery: "taquerías", denue: "tacos", sinonimos: ["tacos", "taco"], grupo: G_ALIMENTOS },
  { key: "cafeterias", label: "Cafeterías", types: ["cafe", "coffee_shop"], textQuery: "cafeterías", denue: "cafeteria", sinonimos: ["cafe", "cafes", "starbucks"], grupo: G_ALIMENTOS },
  { key: "comida_rapida", label: "Comida rápida", types: ["fast_food_restaurant"], textQuery: "comida rápida", denue: "comida rapida", sinonimos: ["fast food", "hamburguesas"], grupo: G_ALIMENTOS },
  { key: "pizzerias", label: "Pizzerías", types: ["pizza_restaurant"], textQuery: "pizzerías", denue: "pizzas", sinonimos: ["pizza", "pizzas"], grupo: G_ALIMENTOS },
  { key: "panaderias", label: "Panaderías", types: ["bakery"], textQuery: "panaderías", denue: "panaderia", sinonimos: ["pan", "pasteleria", "reposteria"], grupo: G_ALIMENTOS },
  { key: "tortillerias", label: "Tortillerías", types: [], textQuery: "tortillerías", denue: "tortilleria", sinonimos: ["tortillas"], grupo: G_ALIMENTOS },
  { key: "carnicerias", label: "Carnicerías", types: [], textQuery: "carnicerías", denue: "carniceria", sinonimos: ["carne", "carnes"], grupo: G_ALIMENTOS },
  { key: "pescaderias", label: "Pescaderías", types: [], textQuery: "pescaderías", denue: "pescaderia", sinonimos: ["pescado fresco"], grupo: G_ALIMENTOS },
  { key: "fruterias", label: "Fruterías y verdulerías", types: [], textQuery: "fruterías y verdulerías", denue: "frutas y verduras", sinonimos: ["fruta", "verdura", "recauderia"], grupo: G_ALIMENTOS },
  { key: "vinaterias", label: "Vinaterías y licorerías", types: ["liquor_store"], textQuery: "vinaterías y licorerías", denue: "vinos y licores", sinonimos: ["vinos", "licores", "licoreria", "alcohol"], grupo: G_ALIMENTOS },
  { key: "abarrotes", label: "Abarrotes y misceláneas", types: [], textQuery: "tiendas de abarrotes", denue: "abarrotes", sinonimos: ["miscelanea", "tiendita", "canal tradicional"], grupo: G_ALIMENTOS },
  { key: "dulcerias", label: "Dulcerías", types: [], textQuery: "dulcerías", denue: "dulceria", sinonimos: ["dulces"], grupo: G_ALIMENTOS },
  { key: "neverias", label: "Neverías y paleterías", types: ["ice_cream_shop"], textQuery: "neverías y paleterías", denue: "helados", sinonimos: ["helado", "paletas", "nieve", "paleteria"], grupo: G_ALIMENTOS },
  // ---- retail ----
  { key: "conveniencia", label: "Tiendas de conveniencia", types: ["convenience_store"], textQuery: "tiendas de conveniencia", denue: "conveniencia", sinonimos: ["oxxo", "seven", "24 horas"], grupo: G_RETAIL },
  { key: "departamentales", label: "Tiendas departamentales", types: ["department_store"], textQuery: "tiendas departamentales", denue: "tienda departamental", sinonimos: ["liverpool", "palacio de hierro", "sears"], grupo: G_RETAIL },
  { key: "mueblerias", label: "Mueblerías", types: ["furniture_store"], textQuery: "mueblerías", denue: "muebles", sinonimos: ["muebles", "sala", "colchones"], grupo: G_RETAIL },
  { key: "electrodomesticos", label: "Electrodomésticos", types: ["home_goods_store"], textQuery: "tiendas de electrodomésticos", denue: "electrodomesticos", sinonimos: ["linea blanca", "coppel", "elektra"], grupo: G_RETAIL },
  { key: "ropa_moda", label: "Tiendas de ropa y moda", types: ["clothing_store"], textQuery: "tiendas de ropa", denue: "ropa", sinonimos: ["moda", "boutique", "vestidos"], grupo: G_RETAIL },
  { key: "zapaterias", label: "Zapaterías", types: ["shoe_store"], textQuery: "zapaterías", denue: "calzado", sinonimos: ["zapatos", "tenis"], grupo: G_RETAIL },
  { key: "joyerias", label: "Joyerías", types: ["jewelry_store"], textQuery: "joyerías", denue: "joyeria", sinonimos: ["joyas", "relojes"], grupo: G_RETAIL },
  { key: "deportivas", label: "Tiendas deportivas", types: ["sporting_goods_store"], textQuery: "tiendas de artículos deportivos", denue: "articulos deportivos", sinonimos: ["deportes", "marti", "innovasport", "decathlon"], grupo: G_RETAIL },
  { key: "jugueterias", label: "Jugueterías", types: [], textQuery: "jugueterías", denue: "jugueteria", sinonimos: ["juguetes"], grupo: G_RETAIL },
  { key: "papelerias", label: "Papelerías", types: [], textQuery: "papelerías", denue: "papeleria", sinonimos: ["utiles", "oficina"], grupo: G_RETAIL },
  { key: "librerias", label: "Librerías", types: ["book_store"], textQuery: "librerías", denue: "libros", sinonimos: ["gandhi", "sotano"], grupo: G_RETAIL },
  { key: "ferreterias", label: "Ferreterías", types: ["hardware_store"], textQuery: "ferreterías", denue: "ferreteria", sinonimos: ["herramientas", "materiales"], grupo: G_RETAIL },
  { key: "tlapalerias", label: "Tlapalerías", types: [], textQuery: "tlapalerías", denue: "tlapaleria", sinonimos: ["pinturas"], grupo: G_RETAIL },
  { key: "opticas", label: "Ópticas", types: [], textQuery: "ópticas", denue: "optica", sinonimos: ["lentes", "anteojos", "devlyn"], grupo: G_RETAIL },
  { key: "perfumerias", label: "Perfumerías y cosméticos", types: [], textQuery: "perfumerías y tiendas de cosméticos", denue: "perfumeria", sinonimos: ["perfumes", "cosmeticos", "maquillaje", "sephora"], grupo: G_RETAIL },
  { key: "electronica", label: "Tiendas de electrónica", types: ["electronics_store"], textQuery: "tiendas de electrónica", denue: "electronica", sinonimos: ["computadoras", "gadgets", "steren", "best buy"], grupo: G_RETAIL },
  { key: "florerias", label: "Florerías", types: ["florist"], textQuery: "florerías", denue: "floreria", sinonimos: ["flores", "arreglos florales"], grupo: G_RETAIL },
  // ---- salud y bienestar ----
  { key: "farmacias", label: "Farmacias", types: ["pharmacy", "drugstore"], textQuery: "farmacias", denue: "farmacia", sinonimos: ["medicinas", "guadalajara", "ahorro", "similares"], grupo: G_SALUD },
  { key: "hospitales", label: "Hospitales y clínicas", types: ["hospital"], textQuery: "hospitales", denue: "hospital", sinonimos: ["clinica", "urgencias"], grupo: G_SALUD },
  { key: "consultorios_medicos", label: "Consultorios médicos", types: ["doctor"], textQuery: "consultorios médicos", denue: "consultorios de medicina", sinonimos: ["doctor", "medico general"], grupo: G_SALUD },
  { key: "consultorios_dentales", label: "Consultorios dentales", types: ["dentist", "dental_clinic"], textQuery: "consultorios dentales", denue: "dental", sinonimos: ["dentista", "odontologia"], grupo: G_SALUD },
  { key: "laboratorios", label: "Laboratorios clínicos", types: ["medical_lab"], textQuery: "laboratorios clínicos", denue: "laboratorios medicos", sinonimos: ["analisis clinicos", "chopo", "salud digna"], grupo: G_SALUD },
  { key: "gimnasios", label: "Gimnasios", types: ["gym", "fitness_center"], textQuery: "gimnasios", denue: "gimnasio", sinonimos: ["gym", "fitness", "smartfit", "crossfit"], grupo: G_SALUD },
  { key: "yoga_pilates", label: "Estudios de yoga y pilates", types: ["yoga_studio"], textQuery: "estudios de yoga y pilates", denue: "yoga", sinonimos: ["pilates"], grupo: G_SALUD },
  { key: "spas", label: "Spas", types: ["spa"], textQuery: "spas", denue: "spa", sinonimos: ["masajes"], grupo: G_SALUD },
  { key: "esteticas", label: "Estéticas y peluquerías", types: ["beauty_salon", "hair_salon"], textQuery: "estéticas", denue: "estetica", sinonimos: ["salon de belleza", "peluqueria", "unas"], grupo: G_SALUD },
  { key: "barberias", label: "Barberías", types: ["barber_shop"], textQuery: "barberías", denue: "barberia", sinonimos: ["barber", "corte de cabello"], grupo: G_SALUD },
  { key: "veterinarias", label: "Veterinarias y mascotas", types: ["veterinary_care", "pet_store"], textQuery: "veterinarias", denue: "veterinaria", sinonimos: ["mascotas", "perros", "petco"], grupo: G_SALUD },
  // ---- automotriz ----
  { key: "agencias_autos", label: "Agencias de autos", types: ["car_dealer"], textQuery: "agencias de autos nuevos", denue: "automoviles nuevos", sinonimos: ["coches", "carros", "agencia", "concesionaria", "distribuidor autos"], grupo: G_AUTO },
  { key: "seminuevos", label: "Autos seminuevos", types: [], textQuery: "autos seminuevos", denue: "automoviles usados", sinonimos: ["usados", "seminuevo", "lote de autos"], grupo: G_AUTO },
  { key: "talleres_mecanicos", label: "Talleres mecánicos", types: ["car_repair"], textQuery: "talleres mecánicos", denue: "reparacion mecanica", sinonimos: ["mecanico", "taller", "servicio automotriz"], grupo: G_AUTO },
  { key: "refaccionarias", label: "Refaccionarias", types: ["auto_parts_store"], textQuery: "refaccionarias", denue: "refacciones", sinonimos: ["autopartes", "autozone"], grupo: G_AUTO },
  { key: "autolavados", label: "Autolavados", types: ["car_wash"], textQuery: "autolavados", denue: "lavado de autos", sinonimos: ["car wash", "lavado"], grupo: G_AUTO },
  { key: "gasolineras", label: "Gasolineras", types: ["gas_station"], textQuery: "gasolineras", denue: "gasolina", sinonimos: ["pemex", "combustible"], grupo: G_AUTO },
  { key: "vulcanizadoras", label: "Vulcanizadoras", types: [], textQuery: "vulcanizadoras", denue: "vulcanizadora", sinonimos: ["llantera", "llantas", "ponchadura"], grupo: G_AUTO },
  { key: "motocicletas", label: "Motocicletas (venta y servicio)", types: [], textQuery: "venta y servicio de motocicletas", denue: "motocicletas", sinonimos: ["motos", "italika"], grupo: G_AUTO },
  // ---- servicios financieros ----
  { key: "bancos", label: "Bancos (sucursales)", types: ["bank"], textQuery: "sucursales bancarias", denue: "banca multiple", sinonimos: ["banco", "sucursal", "bbva", "banorte", "santander"], grupo: G_FINANZAS },
  { key: "cajeros", label: "Cajeros automáticos", types: ["atm"], textQuery: "cajeros automáticos", denue: "cajeros automaticos", sinonimos: ["atm", "cajero"], grupo: G_FINANZAS },
  { key: "empeno", label: "Casas de empeño", types: [], textQuery: "casas de empeño", denue: "empeno", sinonimos: ["monte de piedad", "first cash", "prendario"], grupo: G_FINANZAS },
  { key: "casas_cambio", label: "Casas de cambio", types: [], textQuery: "casas de cambio", denue: "casa de cambio", sinonimos: ["divisas", "dolares", "cambiario"], grupo: G_FINANZAS },
  { key: "aseguradoras", label: "Aseguradoras (oficinas)", types: ["insurance_agency"], textQuery: "oficinas de aseguradoras", denue: "seguros", sinonimos: ["seguro", "gnp", "axa"], grupo: G_FINANZAS },
  { key: "financieras", label: "Financieras y préstamos", types: [], textQuery: "financieras y casas de préstamos", denue: "prestamos", sinonimos: ["credito", "sofom", "financiamiento"], grupo: G_FINANZAS },
  // ---- servicios y B2B ----
  { key: "telefonia", label: "Tiendas de telefonía", types: ["cell_phone_store"], textQuery: "tiendas de telefonía celular", denue: "telefonos", sinonimos: ["celulares", "telcel", "att", "movistar"], grupo: G_SERVICIOS },
  { key: "marketing", label: "Agencias de marketing y publicidad", types: [], textQuery: "agencias de marketing y publicidad", denue: "agencias de publicidad", sinonimos: ["publicidad", "agencia digital", "medios"], grupo: G_SERVICIOS },
  { key: "corporativos", label: "Despachos y oficinas corporativas", types: ["corporate_office"], textQuery: "despachos y oficinas corporativas", denue: "despacho", sinonimos: ["oficinas", "corporativo", "consultoria"], grupo: G_SERVICIOS },
  { key: "coworkings", label: "Coworkings", types: [], textQuery: "espacios de coworking", denue: "coworking", sinonimos: ["cowork", "oficina compartida", "wework"], grupo: G_SERVICIOS },
  { key: "notarias", label: "Notarías", types: [], textQuery: "notarías públicas", denue: "notaria", sinonimos: ["notario"], grupo: G_SERVICIOS },
  { key: "imprentas", label: "Imprentas", types: [], textQuery: "imprentas", denue: "imprenta", sinonimos: ["impresion", "lonas"], grupo: G_SERVICIOS },
  { key: "paqueterias", label: "Paqueterías y mensajería", types: ["courier_service"], textQuery: "paqueterías y mensajería", denue: "mensajeria", sinonimos: ["paqueteria", "envios", "dhl", "estafeta", "fedex"], grupo: G_SERVICIOS },
  { key: "lavanderias", label: "Lavanderías y tintorerías", types: ["laundry"], textQuery: "lavanderías y tintorerías", denue: "lavanderia", sinonimos: ["tintoreria", "planchado"], grupo: G_SERVICIOS },
  { key: "hoteles", label: "Hoteles", types: ["hotel"], textQuery: "hoteles", denue: "hotel", sinonimos: ["hospedaje", "hotelería"], grupo: G_SERVICIOS },
  { key: "moteles", label: "Moteles", types: ["motel"], textQuery: "moteles", denue: "motel", sinonimos: ["motel de paso", "auto hotel"], grupo: G_SERVICIOS },
  { key: "agencias_viajes", label: "Agencias de viajes", types: ["travel_agency"], textQuery: "agencias de viajes", denue: "agencias de viajes", sinonimos: ["viajes", "tours"], grupo: G_SERVICIOS },
  { key: "inmobiliarias", label: "Bienes raíces (inmobiliarias)", types: ["real_estate_agency"], textQuery: "inmobiliarias", denue: "inmobiliaria", sinonimos: ["bienes raices", "century 21", "remax", "departamentos"], grupo: G_SERVICIOS },
  // ---- educación ----
  { key: "escuelas_privadas", label: "Escuelas privadas", types: ["primary_school", "secondary_school", "school"], textQuery: "escuelas y colegios privados", denue: "colegio", sinonimos: ["escuela", "primaria", "secundaria", "preparatoria"], grupo: G_EDUCACION },
  { key: "universidades", label: "Universidades", types: ["university"], textQuery: "universidades", denue: "universidad", sinonimos: ["facultad", "campus", "tec", "unam"], grupo: G_EDUCACION },
  { key: "guarderias", label: "Guarderías", types: ["child_care_agency"], textQuery: "guarderías", denue: "guarderia", sinonimos: ["estancia infantil", "kinder"], grupo: G_EDUCACION },
  { key: "idiomas", label: "Escuelas de idiomas", types: [], textQuery: "escuelas de idiomas", denue: "idiomas", sinonimos: ["ingles", "harmon hall"], grupo: G_EDUCACION },
  { key: "academias", label: "Academias (música, arte, baile)", types: [], textQuery: "academias de música, arte y baile", denue: "academia", sinonimos: ["musica", "danza", "baile", "pintura"], grupo: G_EDUCACION },
  // ---- entretenimiento y afinidad ----
  { key: "cines", label: "Cines", types: ["movie_theater"], textQuery: "cines", denue: "cine", sinonimos: ["cinepolis", "cinemex", "peliculas"], grupo: G_ENTRETENIMIENTO },
  { key: "estadios", label: "Estadios y arenas", types: ["stadium"], textQuery: "estadios y arenas", denue: "estadio", sinonimos: ["arena", "recinto", "futbol"], grupo: G_ENTRETENIMIENTO },
  { key: "teatros", label: "Teatros", types: ["performing_arts_theater"], textQuery: "teatros", denue: "teatro", sinonimos: ["obras", "auditorio"], grupo: G_ENTRETENIMIENTO },
  { key: "museos", label: "Museos", types: ["museum"], textQuery: "museos", denue: "museo", sinonimos: ["galeria", "exposiciones"], grupo: G_ENTRETENIMIENTO },
  { key: "bares", label: "Bares y antros", types: ["bar", "night_club"], textQuery: "bares", denue: "bar", sinonimos: ["antro", "club nocturno", "cerveza"], grupo: G_ENTRETENIMIENTO },
  { key: "cantinas", label: "Cantinas", types: [], textQuery: "cantinas", denue: "cantina", sinonimos: ["pulqueria"], grupo: G_ENTRETENIMIENTO },
  { key: "salones_eventos", label: "Salones de eventos", types: ["banquet_hall"], textQuery: "salones de eventos y fiestas", denue: "salones para fiestas", sinonimos: ["eventos", "bodas", "jardin de eventos"], grupo: G_ENTRETENIMIENTO },
  { key: "casinos", label: "Casinos", types: ["casino"], textQuery: "casinos", denue: "casino", sinonimos: ["apuestas", "juegos"], grupo: G_ENTRETENIMIENTO },
  { key: "boliches", label: "Boliches y billares", types: ["bowling_alley"], textQuery: "boliches y billares", denue: "boliche", sinonimos: ["billar", "bowling"], grupo: G_ENTRETENIMIENTO },
  { key: "parques_diversiones", label: "Parques de diversiones", types: ["amusement_park"], textQuery: "parques de diversiones", denue: "diversiones", sinonimos: ["feria", "juegos mecanicos", "six flags"], grupo: G_ENTRETENIMIENTO },
  { key: "centros_comerciales", label: "Centros comerciales", types: ["shopping_mall"], textQuery: "centros comerciales", denue: "centro comercial", sinonimos: ["plaza", "mall"], grupo: G_ENTRETENIMIENTO },
];

/** Grupos en el orden del catálogo, con sus categorías en orden. */
export const GRUPOS_CATEGORIAS: { nombre: string; categorias: Categoria[] }[] =
  [
    G_ALIMENTOS,
    G_RETAIL,
    G_SALUD,
    G_AUTO,
    G_FINANZAS,
    G_SERVICIOS,
    G_EDUCACION,
    G_ENTRETENIMIENTO,
  ].map((nombre) => ({
    nombre,
    categorias: CATEGORIAS.filter((c) => c.grupo === nombre),
  }));

export function getCategoria(key: string): Categoria | undefined {
  return CATEGORIAS.find((c) => c.key === key);
}

// normalización local (sin acentos/mayúsculas) para no importar lib/geo
function norm(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Sugerencias en vivo para el autocompletado: matching sin acentos ni
 * mayúsculas sobre etiqueta y sinónimos. Ranking: etiqueta empieza con
 * el texto > sinónimo empieza > etiqueta contiene > sinónimo contiene.
 */
export function sugerirCategorias(texto: string, max = 8): Categoria[] {
  const f = norm(texto);
  if (!f) return [];
  const puntuadas: { c: Categoria; p: number }[] = [];
  for (const c of CATEGORIAS) {
    const label = norm(c.label);
    let p = -1;
    if (label.startsWith(f)) p = 0;
    else if (c.sinonimos.some((s) => s.startsWith(f))) p = 1;
    else if (label.includes(f)) p = 2;
    else if (c.sinonimos.some((s) => s.includes(f))) p = 3;
    if (p >= 0) puntuadas.push({ c, p });
  }
  return puntuadas
    .sort((a, b) => a.p - b.p || a.c.label.localeCompare(b.c.label))
    .slice(0, max)
    .map(({ c }) => c);
}
