/* Minimal renderer for the DarkMatter preview pages (Preact based). */
(function () {
  var h = preact.h, Component = preact.Component;

  function DCLogic(props) { this.props = props || {}; this.state = {}; }
  DCLogic.prototype.setState = function () {};
  DCLogic.prototype.forceUpdate = function () {};
  window.DCLogic = DCLogic;

  var HOLE_ONLY = /^\s*\{\{\s*([^}]+?)\s*\}\}\s*$/;
  var HOLE = /\{\{\s*([^}]+?)\s*\}\}/g;

  function lookup(path, scope) {
    path = path.trim();
    if (path === 'true') return true;
    if (path === 'false') return false;
    if (/^-?\d+(\.\d+)?$/.test(path)) return Number(path);
    var parts = path.split('.'), v = scope;
    for (var i = 0; i < parts.length; i++) {
      if (v == null) return undefined;
      v = v[parts[i]];
    }
    return v;
  }
  function interp(str, scope) {
    return str.replace(HOLE, function (_, p) { var v = lookup(p, scope); return v == null ? '' : String(v); });
  }
  function attrValue(raw, scope) {
    var m = raw.match(HOLE_ONLY);
    if (m) return lookup(m[1], scope);
    return raw.indexOf('{{') >= 0 ? interp(raw, scope) : raw;
  }

  var EVENT = /^on[A-Z]/;
  function props(el, scope) {
    var out = {};
    for (var i = 0; i < el.attributes.length; i++) {
      var a = el.attributes[i], name = a.name, raw = a.value;
      if (name.indexOf('hint-') === 0) continue;
      var v = attrValue(raw, scope);
      // attribute names come lowercased from the parser; restore event + camel names
      var orig = el.__names && el.__names[name] || name;
      if (EVENT.test(orig)) { if (typeof v === 'function') out[orig] = v; continue; }
      if (name === 'ref') { if (v) out.ref = v; continue; }
      if (name === 'value') { out.value = v == null ? '' : v; continue; }
      if (name === 'checked' || name === 'disabled' || name === 'required' || name === 'autoplay' || name === 'muted' || name === 'loop' || name === 'playsinline') {
        if (v === undefined || v === false || v === 'false') continue;
        out[name === 'playsinline' ? 'playsInline' : name === 'autoplay' ? 'autoPlay' : name] = true; continue;
      }
      if (v === undefined) continue;
      out[name] = v;
    }
    return out;
  }

  function render(node, scope, key) {
    if (node.nodeType === 3) {
      var t = node.nodeValue;
      return t.indexOf('{{') >= 0 ? interp(t, scope) : t;
    }
    if (node.nodeType !== 1) return null;
    var tag = node.tagName.toLowerCase();
    if (tag === 'sc-for') {
      var list = attrValue(node.getAttribute('list') || '', scope) || [];
      var as = node.getAttribute('as') || 'item';
      var outF = [];
      for (var i = 0; i < list.length; i++) {
        var s2 = Object.create(scope); s2[as] = list[i]; s2.$index = i;
        outF.push(kids(node, s2, (key || '') + '_' + i));
      }
      return outF;
    }
    if (tag === 'sc-if') {
      return attrValue(node.getAttribute('value') || '', scope) ? kids(node, scope, key) : null;
    }
    var p = props(node, scope);
    if (key != null) p.key = key;
    if (tag.indexOf('dm-') === 0 && /^dm-(table|thead|tbody|tr|td|th)$/.test(tag)) tag = tag.slice(3);
    return h(tag, p, kids(node, scope));
  }
  function kids(node, scope, keyBase) {
    var out = [], c = node.childNodes;
    for (var i = 0; i < c.length; i++) out.push(render(c[i], scope, keyBase != null ? keyBase + '.' + i : null));
    return out;
  }

  // keep the original camelCase attribute names (onClick etc.) which the HTML parser lowercases
  function annotate(root, rawHtml) {
    var names = {};
    rawHtml.replace(/\s(on[A-Z][A-Za-z]+)=/g, function (_, n) { names[n.toLowerCase()] = n; });
    var walk = function (el) {
      if (el.nodeType !== 1) return;
      el.__names = names;
      for (var i = 0; i < el.childNodes.length; i++) walk(el.childNodes[i]);
    };
    walk(root);
  }

  window.mountPage = function (LogicClass) {
    var tpl = document.getElementById('dm-template');
    var raw = tpl.textContent;
    var holder = new DOMParser().parseFromString('<!doctype html><html><body>' + raw + '</body></html>', 'text/html').body;
    annotate(holder, raw);
    var roots = Array.prototype.filter.call(holder.childNodes, function (n) { return n.nodeType === 1; });

    function Page() {
      Component.call(this);
      var self = this;
      var logic = new LogicClass({});
      logic.setState = function (patch) {
        var p = typeof patch === 'function' ? patch(logic.state, logic.props) : patch;
        logic.state = Object.assign({}, logic.state, p);
        self.setState({ v: (self.state.v || 0) + 1 });
      };
      logic.forceUpdate = function () { self.setState({ v: (self.state.v || 0) + 1 }); };
      this.logic = logic;
      this.state = { v: 0 };
    }
    Page.prototype = Object.create(Component.prototype);
    Page.prototype.constructor = Page;
    Page.prototype.componentDidMount = function () {
      if (this.logic.componentDidMount) this.logic.componentDidMount();
      Array.prototype.forEach.call(document.querySelectorAll('video'), function (v) {
        v.muted = true; v.loop = true; v.playsInline = true;
        var p = v.play(); if (p && p.catch) p.catch(function () {});
      });
    };
    Page.prototype.componentWillUnmount = function () { if (this.logic.componentWillUnmount) this.logic.componentWillUnmount(); };
    Page.prototype.render = function () {
      var vals = this.logic.renderVals();
      return h(preact.Fragment, null, roots.map(function (r, i) { return render(r, vals, 'r' + i); }));
    };
    var mount = document.getElementById('app');
    preact.render(h(Page, null), mount);
  };
})();
