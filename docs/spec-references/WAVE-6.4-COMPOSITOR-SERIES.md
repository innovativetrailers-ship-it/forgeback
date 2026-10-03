# Wave 6.4 / 6.5 series — node compositor, then 2.5D nodes

Not built from Wave 6. The control layer already samples overlays, planar inserts, transform keyframes, and a depth parallax offset in one function (`sampleControl` / `controlExportFilters`). Preview and export both call it.

When this series is fed, spec it against the code that exists then:

1. Graph data model — input clip, nodes, output. Adding a node never deletes the clip.
2. Node types — transform, mask, merge, effect, overlay, track-driver, depth, camera.
3. Render engine — the graph calls the same sampler preview and export already share.
4. Editor UI — the graph, not a second preview.

6.1–6.3 and the parallax offset become node types in that graph. They are not rewritten as a separate renderer.
