# FlightPath — Presentation Script (3 speakers, about 10 minutes)

## Work division

| | Person 1 — "Problem, Data & UI" | Person 2 — "Algorithms" | Person 3 — "Backend, Demo & Testing" |
|---|---|---|---|
| **Presents** | Intro, problem, graph model, dataset, tech stack, map UI | Dijkstra, Yen's, BFS, DFS, complexity | API flow, live demo, tests, limitations, conclusion |
| **Time** | ~3 min | ~4 min | ~3 min |
| **Owns in project** | `data/`, `scripts/generate_data.py`, `core/graph.py`, `templates/`, `static/` | `core/algorithms.py` | `app.py`, `run.py`, `tests/`, `README.md` |
| **Viva questions** | Graph, adjacency list, dataset, Leaflet, tech stack | Dijkstra, heap, Yen's, BFS vs DFS, complexity | API, validation, testing, no-route case, future work |

Everyone should read the whole project once. Any teammate may be asked any question.

---

## Slide plan
1. Title  2. Problem & objective  3. Graph model  4. Dataset & tech stack  5. Map UI  6. Dijkstra  7. Yen's algorithm  8. BFS, DFS & complexity  9. System flow  10. Live demo  11. Testing & limitations  12. Conclusion

---

## PERSON 1 (slides 1–5, ~3 min)

**Slide 1 – Title**
"Good morning. We are [names], and our Data Structures project is **FlightPath, an Intelligent Flight Path Optimizer**. I will explain the problem and how we modelled it, then [Person 2] will cover the algorithms and [Person 3] will show the system working."

**Slide 2 – Problem**
"When you travel between two cities there is rarely one best route. The shortest route may not be the cheapest, and the cheapest may not be the fastest. FlightPath lets a user choose a source and destination, pick what to optimise, and compare the best routes on a map."

**Slide 3 – Graph model**
"We model the flight network as a **weighted graph**. Each airport is a **vertex** and each flight is an **edge**. Every edge carries three weights: distance in kilometres, time in minutes, and cost in rupees. The graph is stored as an **adjacency list**, a dictionary mapping each airport code to its list of outgoing flights. We chose this over a matrix because the network is sparse: 79 flights out of roughly 600 possible airport pairs. Airport lookup uses a hash map, so it takes constant time. Edges can be one-way or two-way. For example, Guwahati to Bangkok is one-way in our data."

**Slide 4 – Dataset & tech stack**
"We use 25 airports, 20 in India plus Dubai, Singapore, London, Bangkok and Kuala Lumpur, stored in JSON with real approximate coordinates. Distances are calculated from those coordinates using the haversine formula. **Cost and time are illustrative estimates, not live fares or schedules**, and the app says so. The backend is Python with Flask. The frontend is HTML, CSS and JavaScript with Leaflet for the map. No paid APIs or keys are needed."

**Slide 5 – Map UI**
"The interface has searchable airport selectors and a toggle for distance, cost or time. Results appear as route cards. On the map, the selected route is a thick blue line with labelled stops, and alternatives are dashed amber. The map zooms to fit the chosen route. If the map tiles can't load, a warning appears and the routes still draw. Now [Person 2] will explain how the routes are found."

---

## PERSON 2 (slides 6–8, ~4 min)

**Slide 6 – Dijkstra**
"Thank you. The core is **Dijkstra's algorithm**, which finds the lowest-total-weight path when all weights are non-negative. We keep a **min-heap**, a priority queue ordered by the best known distance. We repeatedly take the closest unvisited airport and finalise it. Then we check each neighbour: if going through this airport gives a shorter path, we update it. This is called **relaxation**. A **parent map** records how we reached each airport, and we follow it backwards at the end to rebuild the path.

Two details matter. Python's heap has no decrease-key operation, so we push a new entry and skip stale ones later. This is **lazy deletion**. And our graph rejects negative weights, because Dijkstra's greedy step would no longer be correct.

We wrote **one reusable function**. A parameter chooses whether it uses distance, cost or time, so there is no duplicated code."

**Slide 7 – Yen's algorithm**
"One best route isn't enough, so we use **Yen's algorithm** to find the K shortest loopless paths. It starts with the Dijkstra best path. Then, for each airport on that path, it blocks the path taken so far and the next flight already used, and runs Dijkstra again from there. The results go into a candidate heap, and the best candidate becomes the next route. Every alternative is therefore a different, valid path with no repeated airports, ranked by the chosen criterion. Nothing is random or invented."

**Slide 8 – BFS, DFS & complexity**
"We also use two traversals. **BFS** with a queue finds the route with the fewest flights, ignoring weights. **DFS**, written iteratively with a stack, lists every airport reachable from a given one.

For complexity, Dijkstra with a binary heap is **O((V+E) log V)**, and the adjacency list uses O(V+E) space. BFS and DFS are O(V+E). Yen's runs Dijkstra about K times V times. With 25 airports all of this is instant. Over to [Person 3]."

---

## PERSON 3 (slides 9–12, ~3 min)

**Slide 9 – System flow**
"When the user clicks 'Find best routes', the browser sends the source, destination and criterion to our Flask API. The server validates the input: both airports must exist and must differ, and the criterion must be valid. Otherwise it returns a clear error. It then runs Yen's algorithm and returns each route with its airports, total distance, cost, time and number of stops. If no path exists, the list is empty and the page shows 'No route exists'. The page then draws the cards and the map."

**Slide 10 – Live demo** (follow the demo script below)

**Slide 11 – Testing & limitations**
"We wrote **9 automated tests**. They compare Dijkstra against a brute-force search for all three criteria. They also check that directed edges work, negative weights are rejected, the no-route case returns nothing, and Yen's results are distinct, loopless and sorted. BFS and DFS are tested too.

Limitations: the data is a static sample, and cost and time are estimates. The network has no layovers or real schedules. Future work could add A\* search with a distance heuristic, real route data from a public dataset, and layover constraints."

**Slide 12 – Conclusion**
"FlightPath shows how graphs, heaps, queues, stacks, hash maps and sets work together in a real application. It uses Dijkstra, Yen's, BFS and DFS, and presents the results on an interactive map. Thank you. We're happy to take questions."

---

## Live demo script (Person 3, ~2 min)
Start with `python run.py`. Keep a browser tab open already.

1. **Distance:** From **DEL** to **TRV**, optimise for **Distance**. Result: DEL → BLR → TRV, 2,240 km, ₹13,950, 267 min.
2. **Switch to Time.** The route changes to DEL → MAA → TRV: 261 min, which is **6 minutes faster** but 2,374 km and ₹15,950. Say: "Different criteria give different best routes."
3. **Alternatives:** click Option 2 and Option 3 in the side panel and show the map highlight change.
4. **Directed edge:** from **BKK** to **GAU**. The route goes BKK → CCU → GAU because Guwahati to Bangkok is a one-way link. Say: "The graph respects direction."
5. **Validation:** pick the same airport twice and show the error message.

Backup if the internet fails: the routes and cards still work, and the map shows the tile warning.

---

## Likely questions and who answers
- Why Dijkstra? What if a weight is negative? → **Person 2**
- Why an adjacency list, not a matrix? → **Person 1**
- How does Yen's find alternatives? → **Person 2**
- Where does the data come from? Is it live? → **Person 1**
- How do you know it is correct? → **Person 3**
- What if there is no route? → **Person 3**
- What is lazy deletion? Heap complexity? → **Person 2**
- How is the map shown? → **Person 1**
