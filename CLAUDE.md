# Seeker — Plataforma de Point of Interest Intelligence

## Contexto de negocio
Seeker es un producto de Gravity (Link Studio), agencia de programmatic advertising y drive-to-store en México/LATAM. Lo usan vendedores y account managers para: (1) encontrar puntos de interés alrededor de PDVs de clientes, (2) explorar categorías de negocio por ciudad/zona, y (3) exportar coordenadas y geocercas poligonales (GeoJSON) para cargar en DSPs (Simpli.fi, Eskimi, DV360).

## Referencia funcional
El archivo gravity-seeker.html en la raíz es la versión 1 funcionando. TODA su funcionalidad debe existir en la plataforma: modos de búsqueda (por orígenes / por zona), carga de Excel/CSV con detección automática de columnas (lat/lng, direccion, nombre y variantes), geocodificación batch en paralelo, 20 categorías + búsqueda "solo por nombre" con filtro estricto normalizado sin acentos, exclusiones de marcas tipo tags, mapa Leaflet oscuro con radios, tabla de resultados colapsable con clic-para-zoom, y los 4 exports (CSV, GeoJSON puntos, GeoJSON geocercas por POI con radio y vértices configurables, GeoJSON radios de origen).

## Reglas de arquitectura
- Next.js 14 App Router + TypeScript + Tailwind.
- La API key de Google vive SOLO en variables de entorno del servidor (GOOGLE_MAPS_KEY). Todas las llamadas a Google pasan por route handlers en /app/api/*. El cliente NUNCA recibe la key. Esto es innegociable.
- Supabase para auth email+password y Postgres (fase 2).
- Mapa con react-leaflet (import dinámico ssr:false), tiles CARTO dark_all.

## Identidad visual (Gravity)
- Fondo #0a0a0c, paneles #101014 / #16161c, líneas #26262e.
- Cian #2fb9e8 (señal/orígenes), magenta #f4368a (POIs/exclusiones), violeta #9d5cf0 (zonas).
- Fuentes: Manrope 800 (display), DM Mono (datos/labels), Inter (cuerpo).
- El isotipo SVG de ondas está en el header de gravity-seeker.html: extráelo como componente GravityMark.
- Textos de UI en español mexicano, tono directo.

## Convenciones
- Componentes en /components, cliente de Google en /lib/google.ts, utilidades geo (haversine, circlePolygon, normalización sin acentos) en /lib/geo.ts, tipos compartidos en /lib/types.ts.
- Commits pequeños y descriptivos en español al final de cada bloque de trabajo.
- npm run build debe pasar limpio antes de cada commit.
