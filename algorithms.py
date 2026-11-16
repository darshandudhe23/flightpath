"""Dijkstra (min-heap), Yen's K-shortest loopless paths, BFS and DFS."""
import heapq
from collections import deque

def dijkstra(g, src, dst, weight="distance", banned_nodes=frozenset(), banned_edges=frozenset(), hop_penalty=0):
    """One reusable implementation for every criterion: `weight` picks the Edge attribute.
    `hop_penalty` is a constant added to every edge (e.g. layover minutes per connection).
    It stays non-negative, so Dijkstra remains correct. Returns (path, total) or None."""
    if hop_penalty < 0:
        raise ValueError("hop_penalty must be non-negative")
    if weight not in g.WEIGHTS:
        raise ValueError(f"Unknown weight {weight}")
    dist, parent, visited, order = {src: 0}, {}, set(), []
    heap = [(0, src)]                           # priority queue (binary min-heap)
    while heap:
        d, u = heapq.heappop(heap)
        if u in visited:                        # lazy deletion of stale heap entries
            continue
        visited.add(u); order.append(u)
        if u != dst:
            for e in g.adj[u]:
                if e.to in visited or e.to in banned_nodes or (u, e.to) in banned_edges:
                    continue
                nd = d + getattr(e, weight) + hop_penalty
                if nd < dist.get(e.to, float("inf")):   # relaxation
                    dist[e.to] = nd; parent[e.to] = u
                    heapq.heappush(heap, (nd, e.to))
        if u == dst:
            path = [dst]
            while path[-1] != src:              # parent map -> path reconstruction
                path.append(parent[path[-1]])
            return path[::-1], d
    return None

def yen_k_shortest(g, src, dst, k=3, weight="distance", avoid=frozenset(), hop_penalty=0):
    """Yen's algorithm: k shortest loopless paths, ascending by total weight.
    `avoid` is a set of airports that may never appear on a route."""
    avoid = frozenset(avoid)
    first = dijkstra(g, src, dst, weight, banned_nodes=avoid, hop_penalty=hop_penalty)
    if not first:
        return []
    A, B, seen = [first], [], {tuple(first[0])}
    while len(A) < k:
        prev = A[-1][0]
        for i in range(len(prev) - 1):
            root = prev[:i + 1]
            banned_edges = {(p[i], p[i + 1]) for p, _ in A if len(p) > i + 1 and p[:i + 1] == root}
            res = dijkstra(g, prev[i], dst, weight, banned_nodes=avoid | set(root[:-1]), banned_edges=banned_edges,
                           hop_penalty=hop_penalty)
            if res:
                cand = tuple(root[:-1] + res[0])
                if cand not in seen:
                    seen.add(cand)
                    heapq.heappush(B, (g.path_weight(cand, weight, hop_penalty), cand))
        if not B:
            break
        c, p = heapq.heappop(B)
        A.append((list(p), c))
    return A

def bfs_fewest_connections(g, src, dst, banned_nodes=frozenset()):
    """Unweighted shortest path (fewest flights) via BFS with a queue + parent map."""
    parent, q = {src: None}, deque([src])
    while q:
        u = q.popleft()
        if u == dst:
            path = []
            while u is not None:
                path.append(u); u = parent[u]
            return path[::-1]
        for e in g.adj[u]:
            if e.to not in parent and e.to not in banned_nodes:
                parent[e.to] = u; q.append(e.to)
    return None

def dfs_reachable(g, src):
    """Iterative DFS (explicit stack): set of airports reachable from src."""
    seen, stack = set(), [src]
    while stack:
        u = stack.pop()
        if u in seen:
            continue
        seen.add(u)
        stack.extend(e.to for e in g.adj[u] if e.to not in seen)
    return seen
