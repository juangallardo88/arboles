# OxyFault – Árbol de Fallas del suministro de oxígeno medicinal en una UCI

**Taller: Árboles – Estructuras de Datos (4.º semestre)**
Universidad Cooperativa de Colombia · Docente: Jhonatan Andrés Mideros Narváez

---

## 1. Caso de estudio (vida real)

En un hospital, los pacientes de la Unidad de Cuidados Intensivos (UCI) que están
conectados a ventiladores dependen del **oxígeno medicinal** que llega por tubería
desde un tanque central. Si ese suministro se interrumpe, la vida de los pacientes
está en riesgo en cuestión de minutos (durante la pandemia de COVID‑19 hubo
hospitales en varios países que vivieron exactamente esta situación).

Los ingenieros biomédicos y de confiabilidad usan una herramienta llamada
**Análisis de Árbol de Fallas** (*Fault Tree Analysis*, FTA), que se aplica en
aviación, plantas nucleares y dispositivos médicos. Es un **árbol jerárquico**:

| Concepto de árboles (clase) | Significado en el Árbol de Fallas |
|---|---|
| **Nodo raíz** | Evento tope: *"La UCI pierde el suministro de oxígeno"* |
| **Nodos rama** | Compuertas lógicas **AND / OR** (eventos intermedios) |
| **Nodos hoja** | Eventos básicos: causas raíz con su probabilidad de falla |
| **Padre / hijo / hermanos** | Una compuerta y las causas que la alimentan |
| **Recorrido post‑orden** | Calcular la probabilidad desde las hojas hasta la raíz |

* **Compuerta OR:** el evento ocurre si ocurre **cualquiera** de sus causas.
  `P = 1 − (1 − p1)(1 − p2)…(1 − pn)`
* **Compuerta AND:** el evento ocurre solo si ocurren **todas** sus causas a la vez
  (sistemas redundantes, por ejemplo tanque principal **y** respaldo).
  `P = p1 · p2 · … · pn`

Con el árbol el programa responde preguntas reales:

1. ¿Cuál es la probabilidad de que la UCI se quede sin oxígeno? (≈ 0,88 % → 1 en 114)
2. ¿Qué combinaciones mínimas de fallas lo provocan? (**conjuntos mínimos de corte**)
3. ¿Hay **puntos únicos de falla** (una sola causa basta)? → Sí: E8, E9 y E12.
4. ¿Qué causa conviene atender primero? (**importancia de Fussell‑Vesely y Birnbaum**)

> Las probabilidades del caso son **valores ilustrativos** (probabilidad de falla
> en un año). Con registros reales de mantenimiento del hospital se obtendría
> el riesgo real.

### El árbol del caso

```
G1 [OR] ICU loses medical oxygen supply
├── G2 [AND] Central oxygen source fails
│   ├── G3 [OR] Liquid oxygen tank (VIE) fails
│   │   ├── E1 Tank empty: supplier delivery delayed      (p=0.02)
│   │   ├── E2 Vaporizer frozen by high demand            (p=0.01)
│   │   └── E3 Main pressure regulator failure            (p=0.005)
│   └── G4 [OR] Backup cylinder manifold fails
│       ├── E4 Backup cylinders empty or not replaced     (p=0.05)
│       ├── G5 [AND] Backup not activated in time
│       │   ├── E5 Automatic changeover valve stuck       (p=0.01)
│       │   └── E6 Staff not trained for manual changeover (p=0.1)
│       └── E7 Manifold leak                              (p=0.008)
├── G6 [OR] Pipeline distribution to ICU fails
│   ├── E8 ICU zone valve closed by mistake               (p=0.003)
│   ├── E9 Pipeline rupture during construction work      (p=0.002)
│   └── G7 [AND] Pressure drop not detected
│       ├── E10 Slow leak in a pipe joint                 (p=0.04)
│       └── E11 Area alarm panel out of service           (p=0.02)
└── E12 Oxygen contaminated at the source                 (p=0.001)
```

Datos del árbol: **raíz** G1 · **peso** 19 nodos · **altura** 5 niveles ·
**orden** 3 · 12 hojas · 6 ramas.

---

## 2. Librería usada: `anytree`

[`anytree`](https://pypi.org/project/anytree/) es una librería de Python para
construir árboles de cualquier orden (n‑arios). Facilita todo el manejo del árbol:

| Necesidad | Lo que aporta anytree |
|---|---|
| Crear nodos y enlazar padre‑hijo | `Node(name, parent=...)` |
| Hijos, hermanos, ancestros, descendientes, hojas | `.children`, `.siblings`, `.ancestors`, `.descendants`, `.leaves` |
| Nivel y altura | `.depth`, `.height` |
| Recorridos | `PreOrderIter`, `PostOrderIter`, `LevelOrderGroupIter` |
| Búsqueda | `find`, `findall` |
| Dibujo en texto | `RenderTree` |
| Mover / eliminar subárboles | asignar `node.parent = otro` o `node.parent = None` |

El backend web usa **Flask** y el frontend está hecho con **HTML, CSS y
JavaScript** puro (el árbol se dibuja en SVG con la notación clásica de compuertas).

---

## 3. Cómo ejecutarlo

Requisitos: **Python 3.10 o superior**.

**Windows**
```bat
run.bat
```

**Linux / macOS**
```bash
chmod +x run.sh
./run.sh
```

**Manual (cualquier sistema)**
```bash
python -m venv .venv
# Windows:  .venv\Scripts\activate
# Linux/Mac: source .venv/bin/activate
pip install -r requirements.txt
python app.py
```

Luego abrir **http://127.0.0.1:5000** en el navegador.

Pruebas unitarias:
```bash
python -m unittest discover tests -v
```

---

## 4. Qué se puede hacer en la interfaz

* **Lienzo del árbol:** arrastrar para mover, rueda para zoom, botón *Fit* para
  ajustar, `−/+` en una compuerta para contraer/expandir su subárbol.
* **Risk view / Class view:** colorea por riesgo (verde → rojo) o por rol de la
  clase (raíz amarilla, ramas azules, hojas verdes, como en las diapositivas).
* **Event:** detalle del nodo seleccionado (nivel, grado, padre, hijos, hermanos,
  camino desde la raíz), editar, cambiar probabilidad con un deslizador
  (análisis "¿qué pasa si…?"), mover el subárbol o eliminarlo.
* **Add:** insertar un evento básico o una compuerta AND/OR bajo cualquier compuerta.
* **Risk:** probabilidad del evento tope, puntos únicos de falla, conjuntos mínimos
  de corte (al pasar el mouse se resalta el camino en el árbol) e importancia.
* **Structure:** raíz, peso, altura, orden, hojas, ramas, niveles y los recorridos
  **pre‑orden, in‑orden, post‑orden y por niveles** con animación paso a paso.
* **Text:** el árbol en texto generado con `RenderTree`.
* **Export / Import JSON** y **Reset case** para volver al caso original.

Los cambios se guardan automáticamente en `data/fault_tree.json`.

---

## 5. Estructura del proyecto

```
oxygen-fault-tree/
├── app.py                  # Servidor Flask: API REST + página principal
├── fault_tree/
│   ├── model.py            # Clase FaultTree sobre anytree (insertar, editar, mover, eliminar, buscar)
│   ├── analysis.py         # Probabilidades, conjuntos mínimos de corte, importancia
│   ├── structure.py        # Conceptos de la clase: nivel, altura, peso, orden, grado, recorridos
│   ├── sample_data.py      # Caso de estudio: oxígeno medicinal en la UCI
│   └── storage.py          # Guardar / cargar el árbol en JSON
├── templates/index.html    # Frontend
├── static/css/styles.css
├── static/js/format.js     # Utilidades de formato
├── static/js/tree-view.js  # Dibujo del árbol en SVG (layout, compuertas, zoom)
├── static/js/app.js        # Lógica de la interfaz y llamadas a la API
├── tests/test_fault_tree.py
├── requirements.txt
├── run.bat / run.sh
└── data/                   # Se crea fault_tree.json al ejecutar
```

### API REST

| Método | Ruta | Acción |
|---|---|---|
| GET | `/api/tree` | Árbol + análisis + estructura |
| POST | `/api/events` | Insertar evento `{parent_id, label, kind, probability, description}` |
| PATCH | `/api/events/<id>` | Editar evento |
| DELETE | `/api/events/<id>` | Eliminar evento y su subárbol |
| POST | `/api/events/<id>/move` | Mover subárbol `{new_parent_id}` |
| GET | `/api/search?q=` | Buscar eventos |
| GET | `/api/export` · POST `/api/import` | Exportar / importar JSON |
| POST | `/api/reset` | Restaurar el caso original |

### Convenciones (iguales a las diapositivas)

* El **nivel** de la raíz es 1 (anytree cuenta `depth` desde 0, por eso se suma 1).
* La **altura** se cuenta en niveles (anytree cuenta aristas, por eso se suma 1).
* El **peso** es el total de nodos; el **grado** de un nodo es su número de hijos
  y el **orden** del árbol es el grado máximo.
* El **in‑orden** generalizado para árboles n‑arios visita: primer hijo → raíz →
  resto de hijos (en un árbol binario es exactamente izquierda → raíz → derecha).
