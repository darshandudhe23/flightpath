# FlightPath — Intelligent Flight Path Optimizer
DSA semester project: airports are graph vertices, flights are weighted edges. Compare routes by distance, cost or time, see them on a map.

## Run
Easiest: `python run.py` (or double-click `run.bat` on Windows, `./run.sh` on Mac/Linux). It creates a `.venv`, installs Flask, starts the server and opens your browser. Use `python run.py --test` to run the tests.

Manual way:
```bash
python -m venv .venv && source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
python app.py                                         # http://127.0.0.1:5000
python -m unittest discover -s tests                  # run tests
python scripts/generate_data.py                       # optional: regenerate dataset
```
Core routing needs no internet or API keys. Only the map tiles and Leaflet script load from the web (a warning shows if tiles fail).

## Features
- **Smart airport search**: type a city, airport name, country or IATA code; keyboard-friendly dropdown.
- **Three goals + comparison**: distance, cost or time, plus a *Compare* tab showing the best route under every goal (and BFS fewest flights) side by side.
- **Route cards**: Cheapest / Fastest / Shortest tags, deltas vs the best option, expandable per-leg breakdown.
- **Advanced options**: layover minutes per connection (affects total time and the time-optimal route), maximum stops, and airports to avoid.
- **Map**: curved flight arcs, animated plane along the selected route, network toggle, click any airport to set From/To or highlight everything reachable (DFS).
- **Share & export**: shareable link (state stored in the URL hash), copy itinerary as text, recent searches.
- **Dark mode** (follows system, with a manual toggle) and a mobile-friendly layout.

## Structure
```
run.py / run.bat / run.sh  One-command launchers
app.py                  Flask routes + validation
core/graph.py           FlightGraph: adjacency list, hash-map airport lookup
core/algorithms.py      Dijkstra (min-heap), Yen's K-shortest, BFS, iterative DFS
data/airports.json      25 airports (20 India + DXB, SIN, LHR, BKK, KUL), real approx. coordinates
data/flights.json       79 connections: distance_km, time_min, cost_inr, bidirectional flag
templates/ static/      Frontend (Leaflet map, route cards)
tests/                  unittest suite
```

## DSA used
| Concept | Where |
|---|---|
| Graph, adjacency list | `FlightGraph.adj` (dict of lists); directed edges via `bidirectional: false` (GAU→BKK) |
| Hash map | airport lookup, `dist`, `parent`, `visited` |
| Min-heap / priority queue | `heapq` in Dijkstra and in Yen's candidate set |
| Queue | BFS (`deque`) |
| Stack | iterative DFS |
| Set | `visited`, banned nodes/edges in Yen |
| Parent map | path reconstruction |

One `dijkstra(g, src, dst, weight)` serves all three criteria; `weight` selects the edge attribute.

## API
`GET /api/airports`, `GET /api/edges`, `POST /api/route` (accepts `layover`, `avoid`, `max_stops`, `k`), `POST /api/compare` (best route per goal), `POST /api/bfs` (fewest connections), `GET /api/reachable/<code>` (DFS).

## Notes
- Distances are great-circle values from the coordinates. Costs and times are **illustrative estimates**, not live fares or schedules.
- Alternatives use real **Yen's algorithm**, so they are distinct, loopless and sorted by the chosen criterion.

## Viva Q&A
**Why Dijkstra?** Edge weights are non-negative and we need single-source shortest paths. BFS ignores weights; Bellman-Ford is slower and only needed for negative weights.
**Complexity?** O((V+E) log V) with a binary heap. Space O(V+E). Yen's: O(K·V·(V+E) log V).
**Why an adjacency list, not a matrix?** The network is sparse (79 edges vs 600 possible pairs). A list uses O(V+E) space and iterates only real neighbours.
**How do you handle stale heap entries?** Lazy deletion: `heapq` has no decrease-key, so we push duplicates and skip nodes already in `visited`.
**What if no route exists?** Dijkstra returns `None`, the API returns an empty list, and the UI shows "No route exists". Directed edges make this possible (BKK→GAU must go via CCU).
**Why does the best route change with the criterion?** Distance, cost and time are different weights, so the cheapest route may not be the shortest.
**How are alternatives found?** Yen's algorithm: for each spur node on the previous best path, ban the root path's nodes and already-used next edges, run Dijkstra, and keep candidates in a heap.
**BFS vs Dijkstra?** BFS minimises the number of flights (unweighted); Dijkstra minimises total weight.
**Why is DFS iterative?** An explicit stack avoids recursion limits and shows the stack structure clearly.
**What if an edge were negative?** Dijkstra's greedy finalisation breaks, so `add_edge` rejects negative weights.
**Limitations / future work?** Static data, no layover times or schedules, A* with a haversine heuristic could speed up search.

**How does layover work with Dijkstra?** A constant per-edge penalty (`hop_penalty`) is added to the time weight. It is non-negative, so Dijkstra stays correct; total time = sum of legs + layover x stops.
**How is 'avoid airports' done?** Those airports go into the banned-node set already used by Yen's algorithm.
