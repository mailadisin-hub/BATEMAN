/* Analytics placeholder charts — swap data source for GA/Plausible later */
(function () {
  'use strict';

  /**
   * ChartModule — minimal SVG line/area chart with no dependencies.
   * Render with real data later via chart.render(points) where points is an
   * array of { label, value }.
   */
  function ChartModule(containerId) {
    this.container = document.getElementById(containerId);
  }

  ChartModule.prototype.render = function (points) {
    if (!this.container) return;
    this.container.innerHTML = '';

    if (!points || points.length === 0) {
      this.renderEmpty();
      return;
    }

    const w = 100;
    const h = 100;
    const max = Math.max.apply(null, points.map(function (p) { return p.value; })) || 1;
    const stepX = w / Math.max(points.length - 1, 1);

    const coords = points.map(function (p, i) {
      return [i * stepX, h - (p.value / max) * (h - 10) - 5];
    });

    const line = coords.map(function (c, i) {
      return (i === 0 ? 'M' : 'L') + c[0].toFixed(2) + ',' + c[1].toFixed(2);
    }).join(' ');

    const area = line + ' L' + w + ',' + h + ' L0,' + h + ' Z';

    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 ' + w + ' ' + h);
    svg.setAttribute('preserveAspectRatio', 'none');
    svg.style.width = '100%';
    svg.style.height = '100%';

    // Grid lines
    for (let i = 1; i < 4; i++) {
      const grid = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      grid.setAttribute('x1', '0');
      grid.setAttribute('x2', String(w));
      grid.setAttribute('y1', String((h / 4) * i));
      grid.setAttribute('y2', String((h / 4) * i));
      grid.setAttribute('stroke', 'rgba(36, 48, 73, 0.6)');
      grid.setAttribute('stroke-width', '0.4');
      svg.appendChild(grid);
    }

    const areaPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    areaPath.setAttribute('d', area);
    areaPath.setAttribute('fill', 'rgba(107, 140, 206, 0.12)');
    svg.appendChild(areaPath);

    const linePath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    linePath.setAttribute('d', line);
    linePath.setAttribute('fill', 'none');
    linePath.setAttribute('stroke', '#6b8cce');
    linePath.setAttribute('stroke-width', '1.2');
    linePath.setAttribute('vector-effect', 'non-scaling-stroke');
    svg.appendChild(linePath);

    this.container.appendChild(svg);
  };

  ChartModule.prototype.renderEmpty = function () {
    if (!this.container) return;
    this.container.innerHTML = '';

    // Faint grid so the panel doesn't look broken
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 100 100');
    svg.setAttribute('preserveAspectRatio', 'none');
    svg.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;';
    for (let i = 1; i < 5; i++) {
      const grid = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      grid.setAttribute('x1', '0');
      grid.setAttribute('x2', '100');
      grid.setAttribute('y1', String(20 * i));
      grid.setAttribute('y2', String(20 * i));
      grid.setAttribute('stroke', 'rgba(36, 48, 73, 0.55)');
      grid.setAttribute('stroke-width', '0.4');
      svg.appendChild(grid);
    }
    this.container.appendChild(svg);

    const msg = document.createElement('div');
    msg.style.cssText =
      'position:absolute;inset:0;display:flex;align-items:center;justify-content:center;' +
      'color:#8a93a8;font-size:0.85rem;text-align:center;padding:1rem;';
    msg.textContent = 'No data yet — connect analytics in Settings';
    this.container.appendChild(msg);
  };

  window.ChartModule = ChartModule;

  // --- Page wiring -----------------------------------------------------------
  const charts = {
    visitors: new ChartModule('chart-visitors'),
    pageviews: new ChartModule('chart-pageviews'),
    conversions: new ChartModule('chart-conversions'),
  };

  function loadData(clientId) {
    // Placeholder: no analytics source connected yet. When GA/Plausible is
    // wired in, fetch per-client series here and call chart.render(points).
    void clientId;
    Object.keys(charts).forEach(function (key) {
      charts[key].renderEmpty();
    });
  }

  const selector = document.getElementById('clientSelector');
  if (selector) {
    selector.addEventListener('change', function () {
      loadData(selector.value);
    });
  }

  loadData('all');
})();
