---
name: clima
description: >
  Consulta el clima local usando wttr.in (sin API key, sin dependencias).
  Devuelve temperatura, condición, humedad y viento de la ubicación actual
  (auto-detectada por IP) o de una ciudad indicada. Responde siempre en español.
  Triggers: "clima", "tiempo", "weather", "¿cómo está el clima?", "¿qué tiempo hace?",
  "temperatura actual", "/clima".
---

# Skill: Consulta de clima local (`/clima`)

Obtén el estado del clima actual usando **wttr.in** — sin API key, sin
instalación de librerías; solo `curl`, que ya viene en Windows 11.

---

## Cómo ejecutar la consulta

### 1. Resumen en una línea (ubicación automática por IP)

```bash
curl -s "https://wttr.in/?format=3"
```

Salida de ejemplo: `Guatemala City: ⛅️  +24°C`

### 2. Reporte ASCII completo (3 días de pronóstico)

```bash
curl -s "https://wttr.in/?lang=es&m"
```

### 3. Ciudad específica (argumento opcional)

```bash
# Pasar la ciudad en la URL
curl -s "https://wttr.in/Guatemala City?format=3&lang=es"
curl -s "https://wttr.in/Madrid?lang=es&m"
```

Reemplaza el espacio con `+` si la shell lo requiere:
```bash
curl -s "https://wttr.in/Guatemala+City?format=3&lang=es"
```

### 4. Datos JSON estructurados (para parsear)

```bash
curl -s "https://wttr.in/?format=j1"
```

Retorna un objeto con:
- `current_condition[]` — temperatura actual, sensación térmica, humedad,
  descripción, viento
- `weather[]` — pronóstico de hasta 3 días con horas
- `nearest_area[]` — ciudad y país detectados

---

## Parámetros útiles de wttr.in

| Parámetro | Efecto |
|-----------|--------|
| `?format=3` | Resumen de una línea: ciudad + icono + temperatura |
| `?format=j1` | JSON completo con pronóstico |
| `?lang=es` | Descripciones de condición en español |
| `?m` | Unidades métricas (°C, km/h) |
| `?u` | Unidades imperiales (°F, mph) |
| `?0` | Solo el día actual (sin pronóstico) |
| `?1` | Hoy + mañana |
| `?2` | 3 días |
| `?T` | Sin colores ANSI (texto plano, fácil de parsear) |

---

## Instrucciones para Claude al ejecutar esta skill

1. **Si el usuario no especificó ciudad**, usa la URL sin ciudad para
   auto-detección por IP:
   ```bash
   curl -s "https://wttr.in/?format=j1"
   ```

2. **Si el usuario pidió una ciudad concreta**, pásala en la URL:
   ```bash
   curl -s "https://wttr.in/<ciudad>?format=j1&lang=es"
   ```

3. **Parsea la respuesta JSON** y presenta al usuario en español:
   - Ciudad y país detectados
   - Temperatura actual y sensación térmica (°C)
   - Condición (despejado, nublado, lluvia, etc.)
   - Humedad relativa (%)
   - Velocidad del viento (km/h y dirección)

4. **Si el usuario pide pronóstico**, añade el resumen de los próximos días
   con temperatura máxima/mínima y condición dominante.

5. **Si `curl` falla** (sin conexión), informa al usuario que se requiere
   acceso a internet y ofrece alternativas (revisar VPN, proxy, etc.).

---

## Nota de privacidad

- La petición se hace a `https://wttr.in` desde tu IP pública.
- wttr.in infiere la ubicación desde esa IP — no se almacena ni se requiere
  autenticación.
- Sin API key ni datos personales enviados.
