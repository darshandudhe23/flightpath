"""Weighted directed graph stored as an adjacency list (dict: IATA code -> list[Edge])."""
import json
from dataclasses import dataclass

@dataclass(frozen=True)
class Edge:
    to: str
    distance: int  # km
    time: int      # minutes (illustrative)
    cost: int      # INR (illustrative)

class FlightGraph:
    WEIGHTS = ("distance", "time", "cost")

    def __init__(self):
        self.airports = {}  # hash map: code -> airport dict (O(1) lookup)
        self.adj = {}       # adjacency list

    def add_airport(self, a):
        self.airports[a["code"]] = a
        self.adj.setdefault(a["code"], [])

    def add_edge(self, u, v, distance, time, cost, bidirectional=True):
        if min(distance, time, cost) < 0:
            raise ValueError("Dijkstra requires non-negative weights")
        for x in (u, v):
            if x not in self.airports:
                raise KeyError(f"Unknown airport {x}")
        self.adj[u].append(Edge(v, distance, time, cost))
        if bidirectional:
            self.adj[v].append(Edge(u, distance, time, cost))

    def edge(self, u, v):
        for e in self.adj[u]:
            if e.to == v:
                return e
        raise KeyError(f"No flight {u}->{v}")

    def path_weight(self, path, weight, hop_penalty=0):
        return sum(getattr(self.edge(a, b), weight) + hop_penalty for a, b in zip(path, path[1:]))

    def summary(self, path, layover=0):
        """Route totals plus a per-leg breakdown. `layover` (minutes) is added to the
        total time once per intermediate stop."""
        legs = []
        for a, b in zip(path, path[1:]):
            e = self.edge(a, b)
            legs.append({"from": a, "to": b, "distance": e.distance, "time": e.time, "cost": e.cost})
        stops = max(len(path) - 2, 0)
        return {"path": list(path),
                "distance": self.path_weight(path, "distance"),
                "cost": self.path_weight(path, "cost"),
                "time": self.path_weight(path, "time") + layover * stops,
                "layover_total": layover * stops,
                "connections": len(path) - 1,
                "stops": stops,
                "legs": legs}

    def edges(self):
        return [{"from": u, "to": e.to, "distance": e.distance, "time": e.time, "cost": e.cost}
                for u, es in self.adj.items() for e in es]

    @classmethod
    def load(cls, airports_path, flights_path):
        g = cls()
        with open(airports_path, encoding="utf-8") as fh:
            airports = json.load(fh)
        with open(flights_path, encoding="utf-8") as fh:
            flights = json.load(fh)
        for a in airports:
            g.add_airport(a)
        for f in flights:
            g.add_edge(f["from"], f["to"], f["distance_km"], f["time_min"], f["cost_inr"], f.get("bidirectional", True))
        return g
