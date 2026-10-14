(() => {
  const containers = document.querySelectorAll('.knowledge-graph');
  if (!containers.length) return;

  const palette = ['#5b6ee1', '#805ad5', '#20958c', '#d38b20', '#d45272', '#3d8bc9', '#2f9c62', '#9a6b46', '#ca6f3c', '#64748b'];
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const svgNS = 'http://www.w3.org/2000/svg';
  const createSvg = (name, attrs = {}) => {
    const element = document.createElementNS(svgNS, name);
    Object.entries(attrs).forEach(([key, value]) => element.setAttribute(key, value));
    return element;
  };

  const hash = (value) => {
    let output = 2166136261;
    for (let i = 0; i < value.length; i += 1) output = Math.imul(output ^ value.charCodeAt(i), 16777619);
    return output >>> 0;
  };

  const layout = (nodes, edges, width, height) => {
    const centerX = width / 2;
    const centerY = height / 2;
    const largeGraph = nodes.length > 100;
    const radius = Math.min(width, height) * .35;
    const groupCenters = new Map();
    const membersByGroup = new Map();
    nodes.forEach((node) => {
      if (!membersByGroup.has(node.group)) membersByGroup.set(node.group, []);
      membersByGroup.get(node.group).push(node);
    });
    if (largeGraph) {
      const groupNames = [...membersByGroup.keys()].sort();
      const columns = Math.ceil(Math.sqrt(groupNames.length * width / height));
      const rows = Math.ceil(groupNames.length / columns);
      const cellWidth = width / columns;
      const cellHeight = height / rows;
      groupNames.forEach((group, index) => {
        groupCenters.set(group, {
          x: cellWidth * (index % columns + .5),
          y: cellHeight * (Math.floor(index / columns) + .5)
        });
      });
    }
    nodes.forEach((node, index) => {
      if (largeGraph) {
        const members = membersByGroup.get(node.group);
        const memberIndex = members.indexOf(node);
        const cluster = groupCenters.get(node.group);
        const cellRadius = Math.min(width / Math.ceil(Math.sqrt(groupCenters.size * width / height)), height / Math.ceil(groupCenters.size / Math.ceil(Math.sqrt(groupCenters.size * width / height)))) * .36;
        const angle = memberIndex * 2.399963 + (hash(node.group) % 100) / 100;
        const distance = cellRadius * Math.sqrt((memberIndex + 1) / Math.max(members.length, 1));
        node.x = cluster.x + Math.cos(angle) * distance;
        node.y = cluster.y + Math.sin(angle) * distance;
      } else {
        const angle = (index / Math.max(nodes.length, 1)) * Math.PI * 2 + (hash(node.id) % 100) / 100;
        node.x = centerX + Math.cos(angle) * radius * (.65 + (hash(`${node.id}r`) % 35) / 100);
        node.y = centerY + Math.sin(angle) * radius * (.65 + (hash(`${node.id}y`) % 35) / 100);
      }
      node.vx = 0;
      node.vy = 0;
    });

    const map = new Map(nodes.map((node) => [node.id, node]));
    const iterations = nodes.length > 80 ? 300 : nodes.length > 35 ? 260 : 190;
    for (let step = 0; step < iterations; step += 1) {
      const cooling = 1 - step / iterations;
      for (let i = 0; i < nodes.length; i += 1) {
        const a = nodes[i];
        for (let j = i + 1; j < nodes.length; j += 1) {
          const b = nodes[j];
          let dx = b.x - a.x;
          let dy = b.y - a.y;
          const distanceSq = Math.max(dx * dx + dy * dy, 80);
          const force = (largeGraph ? 2100 : nodes.length > 30 ? 950 : 720) / distanceSq;
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
        const ideal = largeGraph ? (a.group === b.group ? 115 : 280) : (edge.type === 'link' ? 105 : 145);
        const force = (distance - ideal) * .0038;
        a.vx += (dx / distance) * force;
        a.vy += (dy / distance) * force;
        b.vx -= (dx / distance) * force;
        b.vy -= (dy / distance) * force;
      });
      nodes.forEach((node) => {
        const target = largeGraph ? groupCenters.get(node.group) : {x: centerX, y: centerY};
        node.vx += (target.x - node.x) * (largeGraph ? .0017 : .0008);
        node.vy += (target.y - node.y) * (largeGraph ? .0017 : .0008);
        node.vx *= .82;
        node.vy *= .82;
        node.x = clamp(node.x + node.vx * cooling, 42, width - 42);
        node.y = clamp(node.y + node.vy * cooling, 36, height - 36);
      });
    }

    const collisionPasses = largeGraph ? 110 : 25;
    for (let pass = 0; pass < collisionPasses; pass += 1) {
      for (let i = 0; i < nodes.length; i += 1) {
        const a = nodes[i];
        for (let j = i + 1; j < nodes.length; j += 1) {
          const b = nodes[j];
          let dx = b.x - a.x;
          let dy = b.y - a.y;
          let distance = Math.sqrt(dx * dx + dy * dy);
          if (distance < .01) {
            const angle = (hash(`${a.id}:${b.id}`) % 628) / 100;
            dx = Math.cos(angle);
            dy = Math.sin(angle);
            distance = 1;
          }
          const minimum = largeGraph
            ? 29 + Math.min(((a.degree || 0) + (b.degree || 0)) * .28, 9) + ((a.home || b.home) ? 4 : 0)
            : 20;
          if (distance >= minimum) continue;
          const shift = (minimum - distance) * .52;
          const unitX = dx / distance;
          const unitY = dy / distance;
          a.x -= unitX * shift;
          a.y -= unitY * shift;
          b.x += unitX * shift;
          b.y += unitY * shift;
        }
      }
      nodes.forEach((node) => {
        node.x = clamp(node.x, 42, width - 42);
        node.y = clamp(node.y, 36, height - 36);
      });
    }
    return map;
  };

  const render = async (container) => {
    const response = await fetch(container.dataset.graphUrl);
    if (!response.ok) throw new Error(`Graph request failed: ${response.status}`);
    const data = await response.json();
    const focus = container.dataset.focus;
    const mode = container.dataset.mode;
    const expandedMode = mode === 'subject' || mode === 'global';
    let nodes = data.nodes.map((node) => ({...node}));
    let edges = data.edges.map((edge) => ({...edge}));

    if (!expandedMode) {
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
      container.classList.add(mode === 'global' ? 'global-graph' : 'subject-graph');
    }

    const width = mode === 'global' ? 2200 : 920;
    const height = mode === 'global' ? 1300 : mode === 'subject' ? 620 : 480;
    const groups = [...new Set(nodes.map((node) => node.group))].sort();
    const colors = new Map(groups.map((group, index) => [group, palette[index % palette.length]]));
    const nodeMap = layout(nodes, edges, width, height);
    const svg = createSvg('svg', {
      viewBox: `0 0 ${width} ${height}`,
      role: 'img',
      'aria-label': `${data.course || 'School Vault'} interactive knowledge graph`
    });
    const viewport = createSvg('g');
    const edgeLayer = createSvg('g');
    const nodeLayer = createSvg('g');
    viewport.append(edgeLayer, nodeLayer);
    svg.append(viewport);

    const edgeElements = [];
    edges.forEach((edge) => {
      const source = nodeMap.get(edge.source);
      const target = nodeMap.get(edge.target);
      if (!source || !target) return;
      const line = createSvg('line', {
        x1: source.x,
        y1: source.y,
        x2: target.x,
        y2: target.y,
        class: `graph-edge ${edge.type === 'link' ? 'explicit' : ''}`
      });
      edgeLayer.append(line);
      edgeElements.push({edge, line});
    });

    const tooltip = document.createElement('div');
    tooltip.className = 'graph-tooltip';
    tooltip.hidden = true;
    container.replaceChildren(svg, tooltip);

    const nodeElements = new Map();
    const labelThreshold = nodes.length > 100 ? 7 : nodes.length > 45 ? 2 : 1;
    const openNode = (node) => { window.location.href = `${window.SITE_ROOT}${node.url}`; };

    const updateEdges = () => {
      edgeElements.forEach(({edge, line}) => {
        const source = nodeMap.get(edge.source);
        const target = nodeMap.get(edge.target);
        line.setAttribute('x1', source.x);
        line.setAttribute('y1', source.y);
        line.setAttribute('x2', target.x);
        line.setAttribute('y2', target.y);
      });
    };

    nodes.forEach((node) => {
      const group = createSvg('g', {
        class: `graph-node ${node.id === focus ? 'focus' : ''}`,
        transform: `translate(${node.x} ${node.y})`,
        tabindex: '0',
        role: 'link',
        'aria-label': `${node.title}, ${node.group}`
      });
      const radius = 6.5 + Math.min(node.degree || 0, 8) * .7 + (node.home ? 3 : 0);
      group.append(createSvg('circle', {r: radius, fill: colors.get(node.group)}));
      const label = createSvg('text', {
        x: radius + 5,
        y: 3,
        class: (node.degree || 0) >= labelThreshold || node.id === focus || nodes.length < 18 ? '' : 'minor'
      });
      label.textContent = node.title.length > 32 ? `${node.title.slice(0, 30)}…` : node.title;
      group.append(label);
      group.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          openNode(node);
        }
      });
      group.addEventListener('pointerenter', () => {
        tooltip.textContent = `${node.title} · ${node.group}`;
        tooltip.hidden = false;
      });
      group.addEventListener('pointermove', (event) => {
        const rect = container.getBoundingClientRect();
        tooltip.style.left = `${event.clientX - rect.left}px`;
        tooltip.style.top = `${event.clientY - rect.top}px`;
      });
      group.addEventListener('pointerleave', () => { tooltip.hidden = true; });
      nodeLayer.append(group);
      nodeElements.set(node.id, group);
    });

    const legend = container.parentElement.querySelector('.graph-legend');
    legend.replaceChildren(...groups.map((group) => {
      const item = document.createElement('span');
      item.className = 'legend-item';
      const dot = document.createElement('span');
      dot.className = 'legend-dot';
      dot.style.background = colors.get(group);
      item.append(dot, document.createTextNode(group));
      return item;
    }));

    let scale = 1;
    let panX = 0;
    let panY = 0;
    const applyTransform = () => viewport.setAttribute('transform', `translate(${panX} ${panY}) scale(${scale})`);
    const zoomAt = (nextScale, centerX = width / 2, centerY = height / 2) => {
      nextScale = clamp(nextScale, .45, 3.2);
      const ratio = nextScale / scale;
      panX = centerX - (centerX - panX) * ratio;
      panY = centerY - (centerY - panY) * ratio;
      scale = nextScale;
      applyTransform();
    };
    const graphPoint = (event) => {
      const rect = svg.getBoundingClientRect();
      return {
        x: (event.clientX - rect.left) * width / rect.width,
        y: (event.clientY - rect.top) * height / rect.height
      };
    };

    svg.addEventListener('wheel', (event) => {
      event.preventDefault();
      const point = graphPoint(event);
      zoomAt(scale * (event.deltaY < 0 ? 1.12 : .89), point.x, point.y);
    }, {passive: false});

    let panState = null;
    svg.addEventListener('pointerdown', (event) => {
      if (event.button !== 0 || event.target.closest('.graph-node')) return;
      panState = {pointerId: event.pointerId, x: event.clientX, y: event.clientY, panX, panY};
      svg.setPointerCapture(event.pointerId);
      container.classList.add('panning');
    });
    svg.addEventListener('pointermove', (event) => {
      if (!panState || panState.pointerId !== event.pointerId) return;
      const rect = svg.getBoundingClientRect();
      panX = panState.panX + (event.clientX - panState.x) * width / rect.width;
      panY = panState.panY + (event.clientY - panState.y) * height / rect.height;
      applyTransform();
    });
    const stopPan = (event) => {
      if (!panState || panState.pointerId !== event.pointerId) return;
      panState = null;
      container.classList.remove('panning');
      if (svg.hasPointerCapture(event.pointerId)) svg.releasePointerCapture(event.pointerId);
    };
    svg.addEventListener('pointerup', stopPan);
    svg.addEventListener('pointercancel', stopPan);

    nodeElements.forEach((group, id) => {
      const node = nodeMap.get(id);
      let dragState = null;
      group.addEventListener('pointerdown', (event) => {
        if (event.button !== 0) return;
        event.stopPropagation();
        dragState = {
          pointerId: event.pointerId,
          x: event.clientX,
          y: event.clientY,
          nodeX: node.x,
          nodeY: node.y,
          moved: false
        };
        group.setPointerCapture(event.pointerId);
        group.classList.add('dragging');
      });
      group.addEventListener('pointermove', (event) => {
        if (!dragState || dragState.pointerId !== event.pointerId) return;
        const rect = svg.getBoundingClientRect();
        const dx = (event.clientX - dragState.x) * width / rect.width / scale;
        const dy = (event.clientY - dragState.y) * height / rect.height / scale;
        if (Math.abs(dx) + Math.abs(dy) > 3) dragState.moved = true;
        node.x = dragState.nodeX + dx;
        node.y = dragState.nodeY + dy;
        group.setAttribute('transform', `translate(${node.x} ${node.y})`);
        updateEdges();
      });
      const stopDrag = (event) => {
        if (!dragState || dragState.pointerId !== event.pointerId) return;
        const moved = dragState.moved;
        dragState = null;
        group.classList.remove('dragging');
        if (group.hasPointerCapture(event.pointerId)) group.releasePointerCapture(event.pointerId);
        if (!moved && event.type === 'pointerup') openNode(node);
      };
      group.addEventListener('pointerup', stopDrag);
      group.addEventListener('pointercancel', stopDrag);
    });

    const section = container.closest('.graph-section');
    section.querySelector('[data-graph-zoom="in"]').addEventListener('click', () => zoomAt(scale * 1.2));
    section.querySelector('[data-graph-zoom="out"]').addEventListener('click', () => zoomAt(scale / 1.2));
    section.querySelector('[data-graph-reset]').addEventListener('click', () => {
      scale = 1;
      panX = 0;
      panY = 0;
      applyTransform();
    });

    const search = section.querySelector('[data-graph-search]');
    if (search) {
      search.addEventListener('input', () => {
        const query = search.value.trim().toLocaleLowerCase();
        const matches = new Set();
        nodes.forEach((node) => {
          const matched = !query || `${node.title} ${node.group} ${node.id}`.toLocaleLowerCase().includes(query);
          if (matched) matches.add(node.id);
          const group = nodeElements.get(node.id);
          group.classList.toggle('search-match', Boolean(query) && matched);
          group.classList.toggle('search-dimmed', Boolean(query) && !matched);
        });
        edgeElements.forEach(({edge, line}) => {
          line.classList.toggle('search-dimmed', Boolean(query) && !matches.has(edge.source) && !matches.has(edge.target));
        });
      });
    }
  };

  containers.forEach((container) => render(container).catch(() => {
    container.innerHTML = '<div class="graph-loading">The graph could not be loaded.</div>';
  }));
})();
