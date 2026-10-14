(() => {
  const containers = document.querySelectorAll('.knowledge-graph');
  if (!containers.length) return;

  const palette = ['#5b6ee1', '#805ad5', '#20958c', '#d38b20', '#d45272', '#3d8bc9', '#2f9c62', '#9a6b46'];
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const svgNS = 'http://www.w3.org/2000/svg';
  const createSvg = (name, attrs = {}) => {
    const element = document.createElementNS(svgNS, name);
    Object.entries(attrs).forEach(([key, value]) => element.setAttribute(key, value));
    return element;
  };

  const hash = (text) => {
    let value = 2166136261;
    for (let i = 0; i < text.length; i += 1) value = Math.imul(value ^ text.charCodeAt(i), 16777619);
    return value >>> 0;
  };

  const layout = (nodes, edges, width, height) => {
    const centerX = width / 2;
    const centerY = height / 2;
    const radius = Math.min(width, height) * .34;
    nodes.forEach((node, index) => {
      const angle = (index / Math.max(nodes.length, 1)) * Math.PI * 2 + (hash(node.id) % 100) / 100;
      node.x = centerX + Math.cos(angle) * radius * (.65 + (hash(node.id + 'r') % 35) / 100);
      node.y = centerY + Math.sin(angle) * radius * (.65 + (hash(node.id + 'y') % 35) / 100);
      node.vx = 0;
      node.vy = 0;
    });
    const map = new Map(nodes.map((node) => [node.id, node]));
    const iterations = nodes.length > 35 ? 260 : 190;
    for (let step = 0; step < iterations; step += 1) {
      const cooling = 1 - step / iterations;
      for (let i = 0; i < nodes.length; i += 1) {
        const a = nodes[i];
        for (let j = i + 1; j < nodes.length; j += 1) {
          const b = nodes[j];
          let dx = b.x - a.x;
          let dy = b.y - a.y;
          const distanceSq = Math.max(dx * dx + dy * dy, 80);
          const force = (nodes.length > 30 ? 950 : 720) / distanceSq;
          const distance = Math.sqrt(distanceSq);
          dx /= distance;
          dy /= distance;
          a.vx -= dx * force;
          a.vy -= dy * force;
          b.vx += dx * force;
          b.vy += dy * force;
        }
      }
      edges.forEach((edge) => {
        const a = map.get(edge.source);
        const b = map.get(edge.target);
        if (!a || !b) return;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const distance = Math.max(Math.sqrt(dx * dx + dy * dy), 1);
        const ideal = edge.type === 'link' ? 105 : 145;
        const force = (distance - ideal) * .0038;
        a.vx += (dx / distance) * force;
        a.vy += (dy / distance) * force;
        b.vx -= (dx / distance) * force;
        b.vy -= (dy / distance) * force;
      });
      nodes.forEach((node) => {
        node.vx += (centerX - node.x) * .0008;
        node.vy += (centerY - node.y) * .0008;
        node.vx *= .82;
        node.vy *= .82;
        node.x = clamp(node.x + node.vx * cooling, 36, width - 36);
        node.y = clamp(node.y + node.vy * cooling, 28, height - 28);
      });
    }
    return map;
  };

  const render = async (container) => {
    const data = await fetch(container.dataset.graphUrl).then((response) => response.json());
    const focus = container.dataset.focus;
    const subjectMode = container.dataset.mode === 'subject';
    let nodes = data.nodes.map((node) => ({...node}));
    let edges = data.edges.map((edge) => ({...edge}));

    if (!subjectMode) {
      const neighbors = new Set([focus]);
      edges.forEach((edge) => {
        if (edge.source === focus) neighbors.add(edge.target);
        if (edge.target === focus) neighbors.add(edge.source);
      });
      if (neighbors.size < 3) {
        data.edges.forEach((edge) => {
          if (neighbors.has(edge.source)) neighbors.add(edge.target);
          if (neighbors.has(edge.target)) neighbors.add(edge.source);
        });
      }
      nodes = nodes.filter((node) => neighbors.has(node.id));
      const ids = new Set(nodes.map((node) => node.id));
      edges = edges.filter((edge) => ids.has(edge.source) && ids.has(edge.target));
    } else {
      container.classList.add('subject-graph');
    }

    const width = 920;
    const height = subjectMode ? 620 : 480;
    const groups = [...new Set(nodes.map((node) => node.group))].sort();
    const colors = new Map(groups.map((group, index) => [group, palette[index % palette.length]]));
    const nodeMap = layout(nodes, edges, width, height);
    const svg = createSvg('svg', {viewBox: `0 0 ${width} ${height}`, role: 'img', 'aria-label': `${data.course} knowledge graph`});
    const viewport = createSvg('g');
    const edgeLayer = createSvg('g');
    const nodeLayer = createSvg('g');
    viewport.append(edgeLayer, nodeLayer);
    svg.append(viewport);

    edges.forEach((edge) => {
      const source = nodeMap.get(edge.source);
      const target = nodeMap.get(edge.target);
      if (!source || !target) return;
      edgeLayer.append(createSvg('line', {x1: source.x, y1: source.y, x2: target.x, y2: target.y, class: `graph-edge ${edge.type === 'link' ? 'explicit' : ''}`}));
    });

    const tooltip = document.createElement('div');
    tooltip.className = 'graph-tooltip';
    tooltip.hidden = true;
    container.replaceChildren(svg, tooltip);

    nodes.forEach((node) => {
      const group = createSvg('g', {class: `graph-node ${node.id === focus ? 'focus' : ''}`, transform: `translate(${node.x} ${node.y})`, tabindex: '0', role: 'link', 'aria-label': node.title});
      const radius = 7 + Math.min(node.degree, 7) * .75 + (node.home ? 3 : 0);
      group.append(createSvg('circle', {r: radius, fill: colors.get(node.group)}));
      const label = createSvg('text', {x: radius + 5, y: 3, class: node.degree > 1 || node.id === focus || nodes.length < 18 ? '' : 'minor'});
      label.textContent = node.title.length > 32 ? `${node.title.slice(0, 30)}…` : node.title;
      group.append(label);
      const open = () => { window.location.href = `${window.SITE_ROOT}${node.url}`; };
      group.addEventListener('click', open);
      group.addEventListener('keydown', (event) => { if (event.key === 'Enter' || event.key === ' ') open(); });
      group.addEventListener('pointerenter', () => { tooltip.textContent = `${node.title} · ${node.group}`; tooltip.hidden = false; });
      group.addEventListener('pointermove', (event) => {
        const rect = container.getBoundingClientRect();
        tooltip.style.left = `${event.clientX - rect.left}px`;
        tooltip.style.top = `${event.clientY - rect.top}px`;
      });
      group.addEventListener('pointerleave', () => { tooltip.hidden = true; });
      nodeLayer.append(group);
    });

    const legend = container.parentElement.querySelector('.graph-legend');
    legend.innerHTML = groups.map((group) => `<span class="legend-item"><span class="legend-dot" style="background:${colors.get(group)}"></span>${group}</span>`).join('');

    let scale = 1;
    const applyScale = () => viewport.setAttribute('transform', `translate(${width * (1 - scale) / 2} ${height * (1 - scale) / 2}) scale(${scale})`);
    const section = container.closest('.graph-section');
    section.querySelector('[data-graph-zoom="in"]').addEventListener('click', () => { scale = clamp(scale + .15, .65, 1.8); applyScale(); });
    section.querySelector('[data-graph-zoom="out"]').addEventListener('click', () => { scale = clamp(scale - .15, .65, 1.8); applyScale(); });
    section.querySelector('[data-graph-reset]').addEventListener('click', () => { scale = 1; applyScale(); });
  };

  containers.forEach((container) => render(container).catch(() => {
    container.innerHTML = '<div class="graph-loading">The graph could not be loaded.</div>';
  }));
})();
