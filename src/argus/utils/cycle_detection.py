from __future__ import annotations


def has_cycles(edge_map: dict[str, list[str]]) -> bool:
    """Return True if edge_map contains any back-edge (i.e. the graph has cycles).

    Uses iterative DFS with a recursion stack to avoid Python recursion limits on
    large graphs.
    """
    all_nodes: set[str] = set(edge_map.keys())
    for neighbors in edge_map.values():
        all_nodes.update(neighbors)

    visited: set[str] = set()

    for start in all_nodes:
        if start in visited:
            continue

        # (node, iterator-over-neighbors, on-recursion-stack)
        stack: list[tuple[str, int]] = [(start, 0)]
        rec_stack: set[str] = set()

        while stack:
            node, idx = stack[-1]

            if idx == 0:
                # First visit to this node
                if node in visited:
                    stack.pop()
                    continue
                visited.add(node)
                rec_stack.add(node)

            neighbors = edge_map.get(node, [])

            if idx < len(neighbors):
                stack[-1] = (node, idx + 1)
                neighbor = neighbors[idx]
                if neighbor in rec_stack:
                    return True
                if neighbor not in visited:
                    stack.append((neighbor, 0))
            else:
                rec_stack.discard(node)
                stack.pop()

    return False
