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
      const goldenAngle = Math.PI * (3 - Math.sqrt(5));
      const spacing = 92;
      const ordered = [...nodes].sort((a, b) => {
        if (a.home !== b.home) return a.home ? -1 : 1;
        return (b.degree || 0) - (a.degree || 0) || hash(a.id) - hash(b.id);
      });
      ordered.forEach((node, index) => {
        const distance = index === 0 ? 0 : spacing * Math.sqrt(index);
        const angleJitter = ((hash(node.id) % 21) - 10) / 240;
        const angle = index * goldenAngle + angleJitter;
        node.x = centerX + Math.cos(angle) * distance * 1.35;
        node.y = centerY + Math.sin(angle) * distance * .72;
        node.vx = 0;
        node.vy = 0;
      });
      return new Map(nodes.map((node) => [node.id, node]));
    }
    if (largeGraph) {
      const horizontalGap = 150;
      const verticalGap = 150;
      const nodeGapX = 130;
      const nodeGapY = 110;
      const blockPaddingX = 170;
      const blockPaddingY = 150;
      const availableWidth = width - 220;
      const blocks = [...membersByGroup.entries()]
        .map(([group, members]) => {
          const columns = Math.ceil(Math.sqrt(members.length * 1.35));
          const rows = Math.ceil(members.length / columns);
          return {
            group,
            members: [...members].sort((a, b) => (b.degree || 0) - (a.degree || 0) || a.title.localeCompare(b.title)),
            columns,
            rows,
            width: blockPaddingX + Math.max(columns - 1, 0) * nodeGapX,
            height: blockPaddingY + Math.max(rows - 1, 0) * nodeGapY
          };
        })
        .sort((a, b) => b.members.length - a.members.length || a.group.localeCompare(b.group));

      const shelves = [];
      let shelf = {blocks: [], width: 0, height: 0};
      blocks.forEach((block) => {
        const nextWidth = shelf.blocks.length ? shelf.width + horizontalGap + block.width : block.width;
        if (shelf.blocks.length && nextWidth > availableWidth) {
          shelves.push(shelf);
          shelf = {blocks: [], width: 0, height: 0};
        }
        shelf.blocks.push(block);
        shelf.width = shelf.blocks.length === 1 ? block.width : shelf.width + horizontalGap + block.width;
        shelf.height = Math.max(shelf.height, block.height);
      });
      if (shelf.blocks.length) shelves.push(shelf);

      const usedHeight = shelves.reduce((sum, row) => sum + row.height, 0) + verticalGap * Math.max(shelves.length - 1, 0);
      let rowY = Math.max((height - usedHeight) / 2, 70);
      shelves.forEach((row) => {
        let blockX = (width - row.width) / 2;
        row.blocks.forEach((block) => {
          const blockCenterX = blockX + block.width / 2;
          const blockCenterY = rowY + row.height / 2;
          const slots = [];
          for (let slotRow = 0; slotRow < block.rows; slotRow += 1) {
            for (let slotColumn = 0; slotColumn < block.columns; slotColumn += 1) {
              slots.push({
                x: blockCenterX + (slotColumn - (block.columns - 1) / 2) * nodeGapX,
                y: blockCenterY + (slotRow - (block.rows - 1) / 2) * nodeGapY
              });
            }
          }
          slots.sort((a, b) => {
            const distanceA = (a.x - blockCenterX) ** 2 + (a.y - blockCenterY) ** 2;
            const distanceB = (b.x - blockCenterX) ** 2 + (b.y - blockCenterY) ** 2;
            return distanceA - distanceB || a.y - b.y || a.x - b.x;
          });
          block.members.forEach((node, index) => {
            node.x = slots[index].x;
            node.y = slots[index].y;
            node.vx = 0;
            node.vy = 0;
          });
          blockX += block.width + horizontalGap;
        });
        rowY += row.height + verticalGap;
      });
      return new Map(nodes.map((node) => [node.id, node]));
    }
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

  const canvasLayout = (nodes, edges, width, height) => {
    const centerX = width / 2;
    const centerY = height / 2;
    nodes.forEach((node) => {
      const angle = (hash(`${node.id}:angle`) % 6283) / 1000;
      const distance = Math.sqrt((hash(`${node.id}:distance`) % 10000) / 10000) * Math.min(width, height) * .39;
      node.x = centerX + Math.cos(angle) * distance * 1.35;
      node.y = centerY + Math.sin(angle) * distance * .78;
      node.vx = 0;
      node.vy = 0;
    });

    const nodeMap = new Map(nodes.map((node) => [node.id, node]));
    const iterations = 175;
    for (let step = 0; step < iterations; step += 1) {
      const cooling = .18 + .82 * (1 - step / iterations);
      for (let i = 0; i < nodes.length; i += 1) {
        const a = nodes[i];
        for (let j = i + 1; j < nodes.length; j += 1) {
          const b = nodes[j];
          let dx = b.x - a.x;
          let dy = b.y - a.y;
          let distanceSq = dx * dx + dy * dy;
          if (distanceSq < 4) {
            const angle = (hash(`${a.id}:${b.id}`) % 6283) / 1000;
            dx = Math.cos(angle) * 2;
            dy = Math.sin(angle) * 2;
            distanceSq = 4;
          }
          const distance = Math.sqrt(distanceSq);
          const force = 7600 / Math.max(distanceSq, 120);
          const fx = dx / distance * force;
          const fy = dy / distance * force;
          a.vx -= fx;
          a.vy -= fy;
          b.vx += fx;
          b.vy += fy;
        }
      }
      edges.forEach((edge) => {
        const a = nodeMap.get(edge.source);
        const b = nodeMap.get(edge.target);
        if (!a || !b) return;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const distance = Math.max(Math.sqrt(dx * dx + dy * dy), 1);
        const ideal = edge.type === 'link' ? 155 : 210;
        const force = (distance - ideal) * .0028;
        const fx = dx / distance * force;
        const fy = dy / distance * force;
        a.vx += fx;
        a.vy += fy;
        b.vx -= fx;
        b.vy -= fy;
      });
      nodes.forEach((node) => {
        node.vx += (centerX - node.x) * .00045;
        node.vy += (centerY - node.y) * .00045;
        node.vx *= .84;
        node.vy *= .84;
        node.x += node.vx * cooling;
        node.y += node.vy * cooling;
      });
    }

    for (let pass = 0; pass < 45; pass += 1) {
      for (let i = 0; i < nodes.length; i += 1) {
        for (let j = i + 1; j < nodes.length; j += 1) {
          const a = nodes[i];
          const b = nodes[j];
          let dx = b.x - a.x;
          let dy = b.y - a.y;
          let distance = Math.sqrt(dx * dx + dy * dy);
          if (distance < .01) {
            dx = 1;
            dy = 0;
            distance = 1;
          }
          const minimum = 48 + Math.min(((a.degree || 0) + (b.degree || 0)) * .35, 14);
          if (distance >= minimum) continue;
          const shift = (minimum - distance) * .51;
          a.x -= dx / distance * shift;
          a.y -= dy / distance * shift;
          b.x += dx / distance * shift;
          b.y += dy / distance * shift;
        }
      }
    }

    const minX = Math.min(...nodes.map((node) => node.x));
    const maxX = Math.max(...nodes.map((node) => node.x));
    const minY = Math.min(...nodes.map((node) => node.y));
    const maxY = Math.max(...nodes.map((node) => node.y));
    const fit = Math.min(width * .86 / Math.max(maxX - minX, 1), height * .84 / Math.max(maxY - minY, 1));
    const sourceCenterX = (minX + maxX) / 2;
    const sourceCenterY = (minY + maxY) / 2;
    nodes.forEach((node) => {
      node.x = centerX + (node.x - sourceCenterX) * fit;
      node.y = centerY + (node.y - sourceCenterY) * fit;
    });
    return nodeMap;
  };

  const renderGlobalCanvas = (container, data, nodes, edges, focus) => {
    const graphWidth = 2600;
    const graphHeight = 1500;
    const nodeMap = canvasLayout(nodes, edges, graphWidth, graphHeight);
    const canvas = document.createElement('canvas');
    canvas.className = 'graph-canvas';
    canvas.setAttribute('role', 'img');
    canvas.setAttribute('aria-label', `${data.course || 'School Vault'} interactive knowledge graph`);
    const tooltip = document.createElement('div');
    tooltip.className = 'graph-tooltip';
    tooltip.hidden = true;
    container.replaceChildren(canvas, tooltip);
    container.classList.add('global-graph', 'canvas-graph');

    const context = canvas.getContext('2d', {alpha: true, desynchronized: true});
    const section = container.closest('.graph-section');
    let cssWidth = 1;
    let cssHeight = 1;
    let pixelRatio = 1;
    let viewScale = 1;
    let offsetX = 0;
    let offsetY = 0;
    let hovered = null;
    let searchMatches = null;
    let framePending = false;
    let interaction = null;

    const nodeRadius = (node) => 3.2 + Math.min(node.degree || 0, 16) * .28 + (node.id === focus ? 2.4 : 0);
    const screenPoint = (node) => ({x: offsetX + node.x * viewScale, y: offsetY + node.y * viewScale});
    const requestDraw = () => {
      if (framePending) return;
      framePending = true;
      requestAnimationFrame(() => {
        framePending = false;
        draw();
      });
    };

    const draw = () => {
      context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
      context.clearRect(0, 0, cssWidth, cssHeight);
      const points = new Map(nodes.map((node) => [node.id, screenPoint(node)]));
      edges.forEach((edge) => {
        const source = points.get(edge.source);
        const target = points.get(edge.target);
        if (!source || !target) return;
        if ((source.x < -30 && target.x < -30) || (source.x > cssWidth + 30 && target.x > cssWidth + 30) ||
            (source.y < -30 && target.y < -30) || (source.y > cssHeight + 30 && target.y > cssHeight + 30)) return;
        const highlighted = hovered && (edge.source === hovered.id || edge.target === hovered.id);
        const matched = searchMatches && (searchMatches.has(edge.source) || searchMatches.has(edge.target));
        context.beginPath();
        context.moveTo(source.x, source.y);
        context.lineTo(target.x, target.y);
        context.strokeStyle = highlighted ? 'rgba(132,162,255,.82)' : matched ? 'rgba(101,137,235,.58)' : 'rgba(66,89,145,.27)';
        context.lineWidth = highlighted ? 1.35 : .65;
        context.stroke();
      });

      nodes.forEach((node) => {
        const point = points.get(node.id);
        const radius = nodeRadius(node);
        if (point.x < -radius || point.x > cssWidth + radius || point.y < -radius || point.y > cssHeight + radius) return;
        const dimmed = searchMatches && !searchMatches.has(node.id);
        context.globalAlpha = dimmed ? .12 : 1;
        context.beginPath();
        context.arc(point.x, point.y, radius, 0, Math.PI * 2);
        context.fillStyle = node.id === focus ? '#91a8ff' : '#5f7fe8';
        context.fill();
        if (node === hovered || node.id === focus) {
          context.strokeStyle = '#c7d3ff';
          context.lineWidth = 1.8;
          context.stroke();
        }
        if (node === hovered || node.id === focus || (searchMatches && searchMatches.has(node.id))) {
          context.font = '600 12px Inter, ui-sans-serif, system-ui, sans-serif';
          context.textBaseline = 'middle';
          context.lineWidth = 4;
          context.strokeStyle = '#071022';
          context.strokeText(node.title, point.x + radius + 7, point.y);
          context.fillStyle = '#edf3ff';
          context.fillText(node.title, point.x + radius + 7, point.y);
        }
        context.globalAlpha = 1;
      });
    };

    const focusNode = nodeMap.get(focus) || nodes[0];
    const resetView = () => {
      const nearest = nodes
        .filter((node) => node !== focusNode)
        .map((node) => Math.hypot(node.x - focusNode.x, node.y - focusNode.y))
        .sort((a, b) => a - b);
      const fifthDistance = nearest[Math.min(3, nearest.length - 1)] || 120;
      viewScale = Math.max(cssWidth, cssHeight) / Math.max(fifthDistance * 2.15, 1);
      offsetX = cssWidth / 2 - focusNode.x * viewScale;
      offsetY = cssHeight / 2 - focusNode.y * viewScale;
      requestDraw();
    };

    const resize = (reset = false) => {
      const rect = container.getBoundingClientRect();
      cssWidth = Math.max(Math.round(rect.width), 1);
      cssHeight = Math.max(Math.round(rect.height), 1);
      pixelRatio = Math.min(window.devicePixelRatio || 1, 1.5);
      canvas.width = Math.round(cssWidth * pixelRatio);
      canvas.height = Math.round(cssHeight * pixelRatio);
      canvas.style.width = `${cssWidth}px`;
      canvas.style.height = `${cssHeight}px`;
      if (reset) resetView(); else requestDraw();
    };

    const hitNode = (x, y) => {
      let match = null;
      let nearest = Infinity;
      nodes.forEach((node) => {
        const point = screenPoint(node);
        const distance = Math.hypot(point.x - x, point.y - y);
        const hitRadius = Math.max(nodeRadius(node) + 7, 11);
        if (distance <= hitRadius && distance < nearest) {
          nearest = distance;
          match = node;
        }
      });
      return match;
    };

    const pointerPosition = (event) => {
      const rect = canvas.getBoundingClientRect();
      return {x: event.clientX - rect.left, y: event.clientY - rect.top};
    };

    canvas.addEventListener('wheel', (event) => {
      event.preventDefault();
      const point = pointerPosition(event);
      const graphX = (point.x - offsetX) / viewScale;
      const graphY = (point.y - offsetY) / viewScale;
      const nextScale = viewScale * Math.exp(-event.deltaY * .00125);
      if (!Number.isFinite(nextScale) || nextScale <= 0) return;
      viewScale = nextScale;
      offsetX = point.x - graphX * viewScale;
      offsetY = point.y - graphY * viewScale;
      requestDraw();
    }, {passive: false});

    canvas.addEventListener('pointerdown', (event) => {
      if (event.button !== 0) return;
      const point = pointerPosition(event);
      const node = hitNode(point.x, point.y);
      interaction = {
        pointerId: event.pointerId,
        startX: point.x,
        startY: point.y,
        offsetX,
        offsetY,
        node,
        nodeX: node ? node.x : 0,
        nodeY: node ? node.y : 0,
        moved: false
      };
      canvas.setPointerCapture(event.pointerId);
      container.classList.add('panning');
    });
    canvas.addEventListener('pointermove', (event) => {
      const point = pointerPosition(event);
      if (interaction && interaction.pointerId === event.pointerId) {
        const dx = point.x - interaction.startX;
        const dy = point.y - interaction.startY;
        if (Math.abs(dx) + Math.abs(dy) > 4) interaction.moved = true;
        if (interaction.node) {
          interaction.node.x = interaction.nodeX + dx / viewScale;
          interaction.node.y = interaction.nodeY + dy / viewScale;
        } else {
          offsetX = interaction.offsetX + dx;
          offsetY = interaction.offsetY + dy;
        }
        requestDraw();
        return;
      }
      const nextHovered = hitNode(point.x, point.y);
      if (nextHovered !== hovered) {
        hovered = nextHovered;
        canvas.style.cursor = hovered ? 'pointer' : 'grab';
        tooltip.hidden = !hovered;
        if (hovered) tooltip.textContent = `${hovered.title} · ${hovered.group}`;
        requestDraw();
      }
      if (hovered) {
        tooltip.style.left = `${point.x}px`;
        tooltip.style.top = `${point.y}px`;
      }
    });
    const stopInteraction = (event) => {
      if (!interaction || interaction.pointerId !== event.pointerId) return;
      const selected = interaction.node;
      const moved = interaction.moved;
      interaction = null;
      container.classList.remove('panning');
      if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
      if (selected && !moved && event.type === 'pointerup') window.location.href = `${window.SITE_ROOT}${selected.url}`;
    };
    canvas.addEventListener('pointerup', stopInteraction);
    canvas.addEventListener('pointercancel', stopInteraction);
    canvas.addEventListener('pointerleave', () => {
      if (!interaction) {
        hovered = null;
        tooltip.hidden = true;
        requestDraw();
      }
    });

    const zoomCenter = (factor) => {
      const centerX = cssWidth / 2;
      const centerY = cssHeight / 2;
      const graphX = (centerX - offsetX) / viewScale;
      const graphY = (centerY - offsetY) / viewScale;
      const nextScale = viewScale * factor;
      if (!Number.isFinite(nextScale) || nextScale <= 0) return;
      viewScale = nextScale;
      offsetX = centerX - graphX * viewScale;
      offsetY = centerY - graphY * viewScale;
      requestDraw();
    };
    section.querySelector('[data-graph-zoom="in"]').addEventListener('click', () => zoomCenter(1.25));
    section.querySelector('[data-graph-zoom="out"]').addEventListener('click', () => zoomCenter(.8));
    section.querySelector('[data-graph-reset]').addEventListener('click', resetView);

    const search = section.querySelector('[data-graph-search]');
    if (search) {
      search.addEventListener('input', () => {
        const query = search.value.trim().toLocaleLowerCase();
        searchMatches = query ? new Set(nodes.filter((node) => `${node.title} ${node.group} ${node.id}`.toLocaleLowerCase().includes(query)).map((node) => node.id)) : null;
        if (searchMatches && searchMatches.size) {
          const match = nodes.find((node) => searchMatches.has(node.id));
          offsetX = cssWidth / 2 - match.x * viewScale;
          offsetY = cssHeight / 2 - match.y * viewScale;
        }
        requestDraw();
      });
    }

    const observer = new ResizeObserver(() => resize(false));
    observer.observe(container);
    resize(true);
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

    if (mode === 'global') {
      renderGlobalCanvas(container, data, nodes, edges, focus);
      return;
    }

    const width = mode === 'global' ? 3600 : 920;
    const height = mode === 'global' ? 1900 : mode === 'subject' ? 620 : 480;
    const groups = [...new Set(nodes.map((node) => node.group))].sort();
    const colors = new Map(groups.map((group) => [group, '#7487ff']));
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
    const labelThreshold = nodes.length > 100 ? 15 : nodes.length > 45 ? 2 : 1;
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
      const radius = (6.5 + Math.min(node.degree || 0, 8) * .7 + (node.home ? 3 : 0)) * (mode === 'global' ? .25 : 1);
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

    const initialScale = mode === 'global' ? 10 : 1;
    let scale = initialScale;
    let panX = width * (1 - initialScale) / 2;
    let panY = height * (1 - initialScale) / 2;
    const applyTransform = () => viewport.setAttribute('transform', `translate(${panX} ${panY}) scale(${scale})`);
    const zoomAt = (nextScale, centerX = width / 2, centerY = height / 2) => {
      if (!Number.isFinite(nextScale) || nextScale <= 0) return;
      const ratio = nextScale / scale;
      panX = centerX - (centerX - panX) * ratio;
      panY = centerY - (centerY - panY) * ratio;
      scale = nextScale;
      applyTransform();
    };
    applyTransform();
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
      scale = initialScale;
      panX = width * (1 - initialScale) / 2;
      panY = height * (1 - initialScale) / 2;
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
