# importhub

Herramienta que toma URLs de productos de **Amazon**, extrae todos sus datos
(titulo, precio, descripcion, especificaciones, fotos, etc.) y los publica
automaticamente como publicaciones en **MercadoLibre**, usando una **cola de
trabajos** para procesar muchas URLs en secuencia sin bloquear nada.

## Como funciona

```
                 POST /api/jobs                 BullMQ (Redis)
Vos --URL-->  API Express  ------ encola ----->  cola "amazon-import"
                                                        |
                                                        v
                                              Worker (1 job a la vez)
                                                        |
                              +-------------------------+-------------------------+
                              |                                                   |
                    1) Scrapea Amazon                                  2) Publica en MercadoLibre
                    (Playwright: titulo, precio,                       (predice categoria, arma el
                    fotos, descripcion, specs)                         item, sube fotos por URL)
                              |                                                   |
                              +-------------------> SQLite (data/importhub.sqlite) <---+
                                              (estado, resultado y errores de cada job)
```

Cada URL que encolas se convierte en un **job** con estado:
`queued -> scraping -> scraped -> publishing -> published` (o `failed` si algo
sale mal, con el error guardado). Podes consultar el estado de todos los jobs
en cualquier momento.

## Requisitos

- Node.js 18+
- Redis (para la cola). Con Docker: `docker compose up -d`
- Una app creada en <https://developers.mercadolibre.com.ar/devcenter> con
  `client_id`, `client_secret` y una `redirect_uri`.

## Instalacion

```bash
npm install
cp .env.example .env
# completa .env con tus credenciales de MercadoLibre y preferencias de precio
```

### 1. Autorizar la app de MercadoLibre (una sola vez)

```bash
npm run ml:auth
```

Te va a mostrar un link para abrir en el navegador, autorizas la app con tu
cuenta de MercadoLibre, y pegas de vuelta la URL/codigo de la redireccion. Los
tokens quedan guardados en `data/ml-token.json` y se renuevan solos a partir
de ahi (no hace falta repetir esto salvo que revoques el acceso).

### 2. Levantar Redis, la API y el worker

```bash
docker compose up -d          # Redis
npm run dev:api                # API en http://localhost:3000
npm run dev:worker             # worker que procesa la cola (en otra terminal)
```

## Uso

### Encolar una URL de Amazon (linea de comandos)

```bash
npm run enqueue -- https://www.amazon.com/dp/B08N5WRWNW
```

### Encolar varias URLs a la vez

```bash
npm run enqueue -- https://amazon.com/dp/AAA https://amazon.com/dp/BBB
```

### Encolar un lote grande desde un archivo (una URL por linea)

```bash
npm run enqueue -- --file urls.txt
```

### Solo scrapear, sin publicar automaticamente

```bash
npm run enqueue -- --no-publish https://www.amazon.com/dp/B08N5WRWNW
```

Despues podes revisar el resultado y publicarlo manualmente:

```bash
curl -X POST http://localhost:3000/api/jobs/<jobId>/publish
```

### Ver el estado de los jobs

```bash
npm run jobs:list
# o via API:
curl http://localhost:3000/api/jobs
curl http://localhost:3000/api/jobs/<jobId>
```

### API REST

| Metodo | Ruta                       | Descripcion                                   |
| ------ | -------------------------- | ---------------------------------------------- |
| POST   | `/api/jobs`                | Encola `{ "url": "..." }` o `{ "urls": [...] }` |
| GET    | `/api/jobs`                | Lista los jobs mas recientes                   |
| GET    | `/api/jobs/:id`            | Detalle de un job (incluye datos scrapeados)   |
| POST   | `/api/jobs/:id/publish`    | Publica manualmente un job ya scrapeado        |

Ejemplo:

```bash
curl -X POST http://localhost:3000/api/jobs \
  -H "Content-Type: application/json" \
  -d '{"url": "https://www.amazon.com/dp/B08N5WRWNW"}'
```

## Que datos extrae el scraper

- Titulo, marca, precio y moneda
- Todas las fotos disponibles (en la resolucion mas alta posible)
- Descripcion, bullet points y tabla de especificaciones tecnicas
- Rating, cantidad de reviews y disponibilidad
- ASIN (identificador del producto en Amazon)

Ver `src/types.ts` (`ScrapedProduct`) para el detalle completo.

## Como se arma la publicacion en MercadoLibre

`src/mercadolibre/mapper.ts` convierte el producto scrapeado en el payload
que espera la API de ML:

- **Categoria**: se predice automaticamente con el endpoint de
  `domain_discovery` de MercadoLibre a partir del titulo.
- **Precio**: `precio_amazon * PRICE_FX_RATE * (1 + PRICE_MARKUP_PERCENT/100)`,
  redondeado a 2 decimales. Ajusta `PRICE_FX_RATE` y `PRICE_MARKUP_PERCENT` en
  `.env` segun tu tipo de cambio y margen deseado.
- **Fotos**: se envian como URLs (`pictures: [{ source: url }]`); es la
  propia API de MercadoLibre la que las descarga, no hace falta subirlas vos.
- **Condicion, tipo de publicacion, stock y envio**: configurables por env
  (`ML_CONDITION`, `ML_LISTING_TYPE_ID`, `ML_DEFAULT_QUANTITY`,
  `ML_SHIPPING_MODE`).

## Variables de entorno importantes

Ver `.env.example` para la lista completa y comentada. Las mas relevantes:

- `ML_SITE_ID`: sitio de MercadoLibre donde publicas (`MLA` Argentina, `MLM`
  Mexico, `MLB` Brasil, etc.)
- `PRICE_FX_RATE` / `PRICE_MARKUP_PERCENT`: como se calcula el precio final
- `AUTO_PUBLISH`: si `true`, cada URL encolada se publica automaticamente
  apenas se termina de scrapear; si `false`, queda en estado `scraped` para
  revisar/publicar manualmente
- `QUEUE_CONCURRENCY`: cuantos jobs procesa el worker en simultaneo (dejalo
  en 1 si queres ser mas conservador con Amazon)

## Consideraciones legales e importantes

- Revisa los **Terminos de Servicio de Amazon** y las leyes aplicables antes
  de scrapear a gran escala; este proyecto esta pensado para uso personal o
  de investigacion, con volumenes bajos y espaciados (`SCRAPER_MIN_DELAY_MS` /
  `SCRAPER_MAX_DELAY_MS`).
  Automatizar la extraccion de datos de un sitio puede incumplir sus
  terminos de uso; sos responsable de usar esta herramienta de forma legal.
- Revisa tambien las **politicas de MercadoLibre** sobre publicaciones
  duplicadas, uso de imagenes de terceros y dropshipping; algunas categorias
  o paises tienen reglas especificas.
- Amazon puede mostrar un captcha si detecta trafico automatizado; en ese
  caso el job queda en `failed` con el error correspondiente. Considera bajar
  la concurrencia, subir los delays o usar un proxy (`SCRAPER_PROXY_URL`).
- El precio, categoria y atributos sugeridos son un punto de partida:
  revisalos antes de dar por buena una publicacion automatica, sobre todo al
  principio.

## Tests

```bash
npm test
```

Cubren el parseo de precios/ratings/ASIN del scraper y el mapeo de producto
a payload de MercadoLibre (incluyendo calculo de precio y validaciones).
