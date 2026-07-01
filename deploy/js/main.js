/* =============================================
   SOS VENEZUELA — Main JS  (conectado a la API en vivo)
   ============================================= */

var API = "https://sos-venezuela-api.fly.dev";

document.addEventListener('DOMContentLoaded', function () {

  /* ---- Language toggle ---- */
  var lang = 'es';
  var btnEs = document.getElementById('lang-es');
  var btnEn = document.getElementById('lang-en');

  function applyLang(l) {
    lang = l;
    document.querySelectorAll('[data-es]').forEach(function (el) {
      if (l === 'en') {
        if (!el.__esHTML) el.__esHTML = el.innerHTML;
        el.textContent = el.getAttribute('data-en') || el.textContent;
      } else {
        if (el.__esHTML) el.innerHTML = el.__esHTML;
      }
    });
    if (btnEs && btnEn) {
      btnEs.className = l === 'es' ? 'active' : '';
      btnEn.className = l === 'en' ? 'active' : '';
    }
  }

  if (btnEs) btnEs.addEventListener('click', function () { applyLang('es'); });
  if (btnEn) btnEn.addEventListener('click', function () { applyLang('en'); });

  /* =========================================================
     DATOS EN VIVO — conexión con la API real
     ========================================================= */
  function esNum(n) { return Math.round(Number(n) || 0).toLocaleString('es-AR'); }
  function fmt(n) { return 'U$D ' + esNum(n); }
  function $(id) { return document.getElementById(id); }
  function setText(id, t) { var e = $(id); if (e) e.textContent = t; }
  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function inits(name) {
    var p = String(name || '?').trim().split(/\s+/);
    return (((p[0] || '')[0] || '?') + ((p[1] || '')[0] || '')).toUpperCase();
  }
  var methodLabel = { mercadopago: 'Mercado Pago', mp: 'Mercado Pago', paypal: 'PayPal', pp: 'PayPal', usdt: 'USDT', crypto: 'USDT', transfer: 'Transferencia', transferencia: 'Transferencia' };

  /* Drive: convertir el link guardado en una URL de imagen embebible. */
  function driveId(url) {
    if (!url) return '';
    var m = String(url).match(/[-\w]{25,}/);
    return m ? m[0] : '';
  }
  function driveThumb(url, w) {
    var id = driveId(url);
    return id ? 'https://drive.google.com/thumbnail?id=' + id + '&sz=w' + (w || 1000) : '';
  }

  /* Tipo de cambio para mostrar equivalente en USD */
  var usdArs = 0;
  function loadRate(cb) {
    fetch(API + '/api/exchange-rate').then(function (r) { return r.json(); }).then(function (d) {
      usdArs = d.usdArs || 0;
      if (cb) cb();
    }).catch(function () { if (cb) cb(); });
  }
  function montoConUsd(total, moneda) {
    if (!total) return '';
    var m = (moneda || 'USD').toUpperCase();
    var base = m + ' ' + esNum(total);
    if (m !== 'USD' && usdArs > 0) base += ' · U$D ' + esNum(Number(total) / usdArs);
    return base;
  }

  var totalEl = $('live-total');

  function tween(from, to) {
    var dur = 700, t0 = performance.now();
    function step(now) {
      var p = Math.min(1, (now - t0) / dur);
      var e = 1 - Math.pow(1 - p, 3);
      if (totalEl) totalEl.textContent = fmt(from + (to - from) * e);
      if (p < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }

  var lastTotal = 0;

  function loadSummary() {
    fetch(API + '/api/summary').then(function (r) { return r.json(); }).then(function (s) {
      tween(lastTotal, s.totalRaised || 0);
      lastTotal = s.totalRaised || 0;
      setText('live-count', esNum(s.donationsCount));
      setText('live-last', s.lastDonation ? (s.lastDonation.donor_name || 'Anónimo') + ' · ' + fmt(s.lastDonation.amount_usd) : '—');
      // Chip "donación en vivo": solo si hay una donación real
      var chip = $('live-chip');
      if (s.lastDonation) {
        setText('live-name', s.lastDonation.donor_name || 'Anónimo');
        setText('live-amt', fmt(s.lastDonation.amount_usd));
        if (chip) chip.style.display = '';
      } else if (chip) {
        chip.style.display = 'none';
      }
      // Consolidado financiero
      setText('consol-ingresos', fmt(s.totalRaised));
      setText('consol-egresos', fmt(s.totalExpenses));
      setText('consol-impuestos', fmt(s.taxes));
      setText('consol-saldo', fmt(s.balance));
    }).catch(function () {});
  }

  function timeAgo(iso) {
    if (!iso) return '';
    var diff = (Date.now() - new Date(iso).getTime()) / 1000;
    if (isNaN(diff)) return '';
    if (diff < 60) return 'hace ' + Math.max(1, Math.floor(diff)) + 's';
    if (diff < 3600) return 'hace ' + Math.floor(diff / 60) + 'm';
    if (diff < 86400) return 'hace ' + Math.floor(diff / 3600) + 'h';
    return new Date(iso).toLocaleDateString('es-AR');
  }

  function loadDonations() {
    var box = $('don-list-body'); if (!box) return;
    fetch(API + '/api/donations').then(function (r) { return r.json(); }).then(function (list) {
      if (!Array.isArray(list)) return;
      if (!list.length) {
        box.innerHTML = '<div class="don-list-row" style="grid-template-columns:1fr"><span style="color:#8a7f73">' +
          (lang === 'en' ? 'No donations yet. Be the first!' : 'Todavía no hay donaciones. ¡Sé el primero!') + '</span></div>';
        return;
      }
      box.innerHTML = list.slice().reverse().map(function (d) {
        var m = methodLabel[d.method] || d.method || '';
        return '<div class="don-list-row">' +
          '<span>' + escapeHtml(d.donor_name || 'Anónimo') + '</span>' +
          '<span class="don-amount">' + fmt(d.amount_usd) + '</span>' +
          '<span>' + escapeHtml(m + (d.country ? ' · ' + d.country : '')) + '</span>' +
          '<span style="color:#8a7f73;font-size:11px">' + escapeHtml(timeAgo(d.created_at)) + '</span>' +
          '</div>';
      }).join('');
    }).catch(function () {});
  }

  /* ---- Inventario disponible ---- */
  function loadInventario() {
    var box = $('inv-list-body'); if (!box) return;
    fetch(API + '/api/transparency/inventario').then(function (r) { return r.json(); }).then(function (list) {
      if (!Array.isArray(list)) return;
      var enStock = list.filter(function (it) { return Number(it.cantidad) > 0; });
      if (!enStock.length) {
        box.innerHTML = '<div class="don-list-row" style="grid-template-columns:1fr"><span style="color:#8a7f73">' +
          (lang === 'en' ? 'No supplies in stock right now.' : 'No hay insumos en stock por el momento.') + '</span></div>';
        return;
      }
      box.innerHTML = enStock.map(function (it) {
        return '<div class="don-list-row">' +
          '<span>' + escapeHtml(it.producto || '') + '</span>' +
          '<span>' + escapeHtml(String(it.cantidad || 0)) + ' ' + escapeHtml(it.unidad || '') + '</span>' +
          '<span>' + (it.precio_unitario ? esNum(it.precio_unitario) : '—') + '</span>' +
          '<span style="color:#8a7f73;font-size:11px">' + escapeHtml(it.ultima_actualizacion || '') + '</span>' +
          '</div>';
      }).join('');
    }).catch(function () {});
  }

  /* ---- Galería de transparencia (facturas + entregas con foto) ---- */
  function txCardHTML(cat, badge, badgeColor, imgUrl, title, sub, idx) {
    var inner = imgUrl
      ? '<div class="tx-card-img"><img src="' + escapeHtml(imgUrl) + '" referrerpolicy="no-referrer" loading="lazy" onerror="this.parentNode.innerHTML=\'<div class=&quot;tx-card-placeholder&quot;>📄</div>\'"><div class="tx-badge" style="background:' + badgeColor + '">' + escapeHtml(badge) + '</div></div>'
      : '<div class="tx-card-img"><div class="tx-card-placeholder">📄</div><div class="tx-badge" style="background:' + badgeColor + '">' + escapeHtml(badge) + '</div></div>';
    return '<div class="tx-item tx-card" data-cat="' + cat + '" data-idx="' + idx + '" style="cursor:pointer">' +
      inner +
      '<div class="tx-card-body"><div class="tx-card-title">' + escapeHtml(title) + '</div>' +
      '<div class="tx-card-sub">' + escapeHtml(sub) + '</div></div>' +
      '</div>';
  }

  var txEntries = []; // datos para el lightbox, indexados por data-idx

  function loadTransparency() {
    var box = $('tx-gallery'); if (!box) return;
    fetch(API + '/api/transparency').then(function (r) { return r.json(); }).then(function (facturas) {
      if (!Array.isArray(facturas)) return;
      txEntries = [];
      var cards = [];
      facturas.forEach(function (f) {
        var totalTxt = montoConUsd(f.total, f.moneda);
        var idxF = txEntries.length;
        txEntries.push({ type: 'factura', data: f });
        cards.push(txCardHTML('factura', 'FACTURA', '#b3541e', driveThumb(f.driveUrl), 'Factura ' + f.numero_factura, totalTxt || (f.proveedor || ''), idxF));
        (f.entregas || []).forEach(function (e) {
          var idxE = txEntries.length;
          txEntries.push({ type: 'entrega', data: e, factura: f });
          cards.push(txCardHTML('entrega', 'ENTREGA', '#2f9e5e', driveThumb(e.driveUrl), e.hospital || 'Entrega', 'Factura ' + (e.numero_factura || f.numero_factura), idxE));
        });
      });
      box.innerHTML = cards.length ? cards.join('')
        : '<div style="grid-column:1/-1;padding:28px 16px;text-align:center;font:500 13px \'Public Sans\';color:#8a7f73">' +
          (lang === 'en' ? 'Purchases and deliveries will appear here in real time.' : 'Las compras y entregas aparecerán acá en tiempo real.') + '</div>';
      // re-aplicar filtro activo
      var activeFilter = document.querySelector('.chip[data-filter].active');
      if (activeFilter && activeFilter.getAttribute('data-filter') !== 'all') applyFilter(activeFilter.getAttribute('data-filter'));
      // click → lightbox
      box.querySelectorAll('.tx-card').forEach(function (card) {
        card.addEventListener('click', function () { openLightbox(parseInt(card.getAttribute('data-idx'), 10)); });
      });
    }).catch(function () {});
  }

  /* ---- Lightbox de comprobante ---- */
  function openLightbox(idx) {
    var entry = txEntries[idx]; if (!entry) return;
    var f = entry.type === 'factura' ? entry.data : entry.factura;
    var e = entry.type === 'entrega' ? entry.data : null;
    var viewUrl = (e || entry.data).driveViewUrl || '';
    var bigImg = driveThumb((e || entry.data).driveUrl, 1600);

    var title, sub, detalle = '';
    if (entry.type === 'factura') {
      title = 'Factura ' + f.numero_factura;
      sub = (f.proveedor ? escapeHtml(f.proveedor) + ' · ' : '') + escapeHtml(montoConUsd(f.total, f.moneda));
      if (f.items && f.items.length) {
        detalle = '<div style="margin-top:14px"><div style="font:700 11px \'IBM Plex Mono\',monospace;letter-spacing:.08em;color:#8a7f73;margin-bottom:8px">' +
          (lang === 'en' ? 'ITEMS' : 'ÍTEMS') + '</div>' +
          f.items.map(function (it) {
            return '<div style="display:flex;justify-content:space-between;gap:12px;padding:6px 0;border-bottom:1px solid #f0e9dd;font:500 13px \'Public Sans\'">' +
              '<span>' + escapeHtml(it.producto) + (it.cantidad ? ' ×' + escapeHtml(it.cantidad) : '') + '</span>' +
              '<span style="color:#8a7f73">' + (it.precio_unitario ? esNum(it.precio_unitario) : '') + '</span></div>';
          }).join('') + '</div>';
      }
    } else {
      title = e.hospital || 'Entrega';
      sub = 'Factura ' + (e.numero_factura || f.numero_factura);
    }

    var ov = document.createElement('div');
    ov.className = 'lightbox-overlay';
    ov.style.cssText = 'position:fixed;inset:0;z-index:2000;background:rgba(12,10,8,.85);display:flex;align-items:center;justify-content:center;padding:20px';
    ov.innerHTML =
      '<div style="background:#fff;border-radius:14px;max-width:560px;width:100%;max-height:90vh;overflow:auto;box-shadow:0 18px 50px rgba(0,0,0,.4)">' +
        '<div style="position:relative;background:#f1ece2">' +
          (bigImg ? '<img src="' + escapeHtml(bigImg) + '" referrerpolicy="no-referrer" style="width:100%;display:block;max-height:60vh;object-fit:contain;background:#17120d" onerror="this.style.display=\'none\'">' : '<div style="padding:60px;text-align:center;font-size:40px">📄</div>') +
          '<button class="lb-close" style="position:absolute;top:10px;right:10px;width:34px;height:34px;border:0;border-radius:50%;background:rgba(0,0,0,.6);color:#fff;font-size:16px;cursor:pointer">✕</button>' +
        '</div>' +
        '<div style="padding:18px 20px">' +
          '<div style="font:800 18px \'Archivo\',sans-serif;color:#17120d">' + escapeHtml(title) + '</div>' +
          '<div style="font:600 13px \'Public Sans\';color:#8a7f73;margin-top:3px">' + sub + '</div>' +
          detalle +
          (viewUrl ? '<a href="' + escapeHtml(viewUrl) + '" target="_blank" rel="noopener" style="display:inline-block;margin-top:16px;font:700 12px \'Public Sans\';color:#b3541e;text-decoration:none">' + (lang === 'en' ? 'Open original in Drive ↗' : 'Ver original en Drive ↗') + '</a>' : '') +
        '</div>' +
      '</div>';
    document.body.appendChild(ov);
    document.body.style.overflow = 'hidden';
    function close() { ov.remove(); document.body.style.overflow = ''; }
    ov.addEventListener('click', function (ev) { if (ev.target === ov || ev.target.classList.contains('lb-close')) close(); });
    document.addEventListener('keydown', function esc(ev) { if (ev.key === 'Escape') { close(); document.removeEventListener('keydown', esc); } });
  }

  /* ---- Chip "donación en vivo" + SSE ---- */
  var hideTimer = null;
  function showLiveChip(name, amount) {
    setText('live-name', name || 'Anónimo');
    setText('live-amt', fmt(amount));
    var chip = $('live-chip');
    if (chip) {
      chip.style.display = '';
      chip.style.animation = 'none'; void chip.offsetWidth; chip.style.animation = 'toastIn .5s ease';
      if (hideTimer) clearTimeout(hideTimer);
    }
  }

  function connectSSE() {
    try {
      var ev = new EventSource(API + '/api/donations/live');
      ev.onmessage = function (msg) {
        try {
          var d = JSON.parse(msg.data);
          var amt = d.amount != null ? d.amount : d.amount_usd;
          if (amt != null && (d.name || d.donor_name)) {
            showLiveChip(d.name || d.donor_name, amt);
            loadSummary();
            loadDonations();
          }
        } catch (e) {}
      };
    } catch (e) {}
  }

  // Arranque (el tipo de cambio primero, para mostrar equivalentes en USD)
  loadRate(function () { loadTransparency(); });
  loadSummary();
  loadDonations();
  loadInventario();
  connectSSE();
  setInterval(function () { loadSummary(); loadRate(loadTransparency); loadInventario(); }, 60000);

  /* ---- Transparency filter ---- */
  function applyFilter(f) {
    document.querySelectorAll('.tx-item').forEach(function (item) {
      item.style.display = (f === 'all' || item.getAttribute('data-cat') === f) ? '' : 'none';
    });
  }
  document.querySelectorAll('.chip[data-filter]').forEach(function (chip) {
    chip.addEventListener('click', function () {
      var f = chip.getAttribute('data-filter');
      document.querySelectorAll('.chip[data-filter]').forEach(function (c) {
        c.classList.toggle('active', c === chip);
      });
      applyFilter(f);
    });
  });

  /* ---- Tab filter (donaciones) ---- */
  document.querySelectorAll('.chip[data-tab]').forEach(function (chip) {
    chip.addEventListener('click', function () {
      var t = chip.getAttribute('data-tab');
      document.querySelectorAll('.chip[data-tab]').forEach(function (c) {
        c.classList.toggle('active', c === chip);
      });
      document.querySelectorAll('.tab-panel').forEach(function (panel) {
        panel.style.display = panel.getAttribute('data-panel') === t ? '' : 'none';
      });
    });
  });

  /* ---- Smooth scroll ---- */
  document.querySelectorAll('[data-scroll]').forEach(function (el) {
    el.addEventListener('click', function () {
      var target = document.getElementById(el.getAttribute('data-scroll'));
      if (target) window.scrollTo({ top: target.getBoundingClientRect().top + window.scrollY - 70, behavior: 'smooth' });
    });
  });

  /* ---- Modal de donación ---- */
  var modal = document.getElementById('donation-modal');
  var modalBg = document.getElementById('modal-bg');
  var modalClose = document.getElementById('modal-close');
  var modalTitle = document.getElementById('modal-title');
  var modalContent = document.getElementById('modal-content');
  var currentMethod = null;

  function openModal(method) {
    currentMethod = method;
    fillModal(method);
    if (modal) modal.classList.add('open');
    document.body.style.overflow = 'hidden';
  }

  function closeModal() {
    if (modal) modal.classList.remove('open');
    document.body.style.overflow = '';
    currentMethod = null;
  }

  document.querySelectorAll('[data-donate]').forEach(function (el) {
    el.addEventListener('click', function () { openModal(el.getAttribute('data-donate')); });
  });

  if (modalBg) modalBg.addEventListener('click', closeModal);
  if (modalClose) modalClose.addEventListener('click', closeModal);
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeModal(); });

  function fillModal(method) {
    var en = lang === 'en';
    var titles = { mp: 'Mercado Pago', pp: 'PayPal', crypto: 'Cripto / USDT' };
    if (modalTitle) modalTitle.textContent = titles[method] || '';

    var amtOpts = [10, 25, 50, 100];
    var amtHTML = '<div class="amount-label">' + (en ? 'CHOOSE AN AMOUNT (U$D)' : 'ELEGÍ UN MONTO (U$D)') + '</div>' +
      '<div class="amount-chips">' +
      amtOpts.map(function (v, i) { return '<div class="amount-chip' + (i === 1 ? ' active' : '') + '" data-amt="' + v + '">U$D ' + v + '</div>'; }).join('') +
      '<div class="amount-chip">' + (en ? 'Other' : 'Otro') + '</div>' +
      '</div>';

    var body = amtHTML;

    if (method === 'mp') {
      body += '<p class="modal-desc">' + (en ? 'You will be redirected to Mercado Pago to complete your donation safely.' : 'Serás redirigido a Mercado Pago para completar tu donación de forma segura.') + '</p>';
      body += '<button class="btn-pay" style="background:#009ee3">' + (en ? 'Pay with Mercado Pago' : 'Pagar con Mercado Pago') + ' →</button>';
    } else if (method === 'pp') {
      body += '<p class="modal-desc">' + (en ? 'You will be redirected to PayPal to complete your donation safely.' : 'Serás redirigido a PayPal para completar tu donación de forma segura.') + '</p>';
      body += '<button class="btn-pay" style="background:#0070ba">' + (en ? 'Pay with PayPal' : 'Pagar con PayPal') + ' →</button>';
    } else if (method === 'crypto') {
      body = '<div class="amount-label">USDT · TRC20</div>';
      body += '<div style="border:1px solid #e6ddcf;border-radius:11px;padding:14px;background:#faf7f1;font:600 13px IBM Plex Mono,monospace;color:#17120d;word-break:break-all;margin-bottom:14px">TXxxxxxxxxxxxxxxxxxxxxxxxxxxxxx — placeholder</div>';
      body += '<p class="modal-desc">' + (en ? 'Send USDT on the TRON (TRC20) network to the address above.' : 'Enviá USDT por la red TRON (TRC20) a la dirección de arriba.') + '</p>';
      body += '<button class="btn-pay" style="background:#f7931a">' + (en ? 'Copy address' : 'Copiar dirección') + ' →</button>';
    }

    if (modalContent) {
      modalContent.innerHTML = body;
      modalContent.querySelectorAll('.amount-chip').forEach(function (chip) {
        chip.addEventListener('click', function () {
          modalContent.querySelectorAll('.amount-chip').forEach(function (c) { c.classList.remove('active'); });
          chip.classList.add('active');
        });
      });
    }
  }

  /* ---- Crisis overlay ---- */
  var crisisOverlay = document.getElementById('crisis-overlay');
  var crisisClose = document.getElementById('crisis-close');

  document.querySelectorAll('.open-crisis').forEach(function (el) {
    el.addEventListener('click', function () {
      if (crisisOverlay) { crisisOverlay.classList.add('open'); crisisOverlay.scrollTop = 0; document.body.style.overflow = 'hidden'; }
    });
  });

  function closeCrisis() {
    if (crisisOverlay) { crisisOverlay.classList.remove('open'); document.body.style.overflow = ''; }
  }

  if (crisisClose) crisisClose.addEventListener('click', closeCrisis);
  document.querySelectorAll('.crisis-donate-btn').forEach(function (el) {
    el.addEventListener('click', function () {
      closeCrisis();
      setTimeout(function () { openModal('mp'); }, 150);
    });
  });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') { closeCrisis(); closeModal(); } });

});
