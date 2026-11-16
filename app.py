from pathlib import Path
from flask import Flask, jsonify, render_template, request
from core import FlightGraph, algorithms

BASE = Path(__file__).parent
app = Flask(__name__)
graph = FlightGraph.load(BASE / "data/airports.json", BASE / "data/flights.json")

EXPLAIN = {
    "distance": "Shortest Distance: Dijkstra minimises the sum of great-circle distances (km).",
    "cost": "Lowest Estimated Cost: Dijkstra minimises the sum of illustrative ticket prices (INR).",
    "time": "Minimum Estimated Flight Time: Dijkstra minimises the sum of illustrative durations (min).",
}
NOTE = " Costs and times are illustrative estimates, not live fares or schedules."


def num(d, key, default, lo, hi):
    """Read an optional integer field and keep it inside [lo, hi]."""
    v = d.get(key, default)
    if v is None:
        return default
    try:
        v = int(v)
    except (TypeError, ValueError):
        raise ValueError(f"'{key}' must be a number.")
    return max(lo, min(v, hi))


def parse():
    d = request.get_json(silent=True) or {}
    s, t, crit = str(d.get("source", "")).upper(), str(d.get("destination", "")).upper(), d.get("criterion", "distance")
    if s not in graph.airports or t not in graph.airports:
        raise ValueError("Unknown source or destination airport.")
    if s == t:
        raise ValueError("Source and destination must be different.")
    if crit not in EXPLAIN:
        raise ValueError("Criterion must be distance, cost or time.")
    raw = d.get("avoid") or []
    if not isinstance(raw, list):
        raise ValueError("'avoid' must be a list of airport codes.")
    avoid = {str(c).upper() for c in raw}
    if avoid - set(graph.airports):
        raise ValueError("Unknown airport in 'avoid'.")
    if avoid & {s, t}:
        raise ValueError("You can't avoid your own origin or destination.")
    opts = {"layover": num(d, "layover", 0, 0, 360),
            "avoid": avoid,
            "max_stops": None if d.get("max_stops") in (None, "") else num(d, "max_stops", None, 0, 4)}
    return s, t, crit, d, opts


@app.errorhandler(ValueError)
def bad(e):
    return jsonify(error=str(e)), 400


@app.get("/")
def index():
    return render_template("index.html")


@app.get("/api/airports")
def airports():
    return jsonify(list(graph.airports.values()))


@app.get("/api/edges")
def edges():
    return jsonify(graph.edges())


@app.post("/api/route")
def route():
    s, t, crit, d, o = parse()
    k = num(d, "k", 3, 1, 5)
    penalty = o["layover"] if crit == "time" else 0     # layover only changes the *time* optimum
    # With a max-stops filter we ask Yen's for extra candidates, then filter and trim.
    found = algorithms.yen_k_shortest(graph, s, t, 12 if o["max_stops"] is not None else k, crit,
                                      avoid=o["avoid"], hop_penalty=penalty)
    routes = [graph.summary(p, o["layover"]) for p, _ in found]
    if o["max_stops"] is not None:
        routes = [r for r in routes if r["stops"] <= o["max_stops"]]
    explanation = EXPLAIN[crit]
    if crit == "time" and o["layover"]:
        explanation += f" Each connection adds a {o['layover']}-minute layover."
    if o["avoid"]:
        explanation += " Avoiding " + ", ".join(sorted(o["avoid"])) + "."
    return jsonify(routes=routes[:k], criterion=crit, filtered_out=bool(found) and not routes,
                   explanation=explanation + NOTE + " Alternatives found with Yen's K-shortest-paths algorithm.")


@app.post("/api/compare")
def compare():
    """Best route under every criterion (Dijkstra x3) plus fewest flights (BFS), side by side."""
    s, t, _, _, o = parse()
    out = {}
    for name, crit in (("shortest", "distance"), ("cheapest", "cost"), ("fastest", "time")):
        r = algorithms.dijkstra(graph, s, t, crit, banned_nodes=o["avoid"],
                                hop_penalty=o["layover"] if crit == "time" else 0)
        out[name] = graph.summary(r[0], o["layover"]) if r else None
    p = algorithms.bfs_fewest_connections(graph, s, t, banned_nodes=o["avoid"])
    out["fewest"] = graph.summary(p, o["layover"]) if p else None
    return jsonify(out)


@app.post("/api/bfs")
def bfs():
    s, t, _, _, o = parse()
    p = algorithms.bfs_fewest_connections(graph, s, t, banned_nodes=o["avoid"])
    return jsonify(route=graph.summary(p, o["layover"]) if p else None)


@app.get("/api/reachable/<code>")
def reachable(code):
    code = code.upper()
    if code not in graph.airports:
        raise ValueError("Unknown airport.")
    return jsonify(reachable=sorted(algorithms.dfs_reachable(graph, code) - {code}))


if __name__ == "__main__":
    app.run(debug=True)
