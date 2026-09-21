// LocFetch Engine v9 - Universal Fetch Interceptor for Local/CORS Environments
// License: XingSoft*2026
// Purpose: Replaces fetch() to fix CORS/MIME issues using JS sidecars (Base64/85/122).
// Compatibility: ES6+, Mobile, Legacy Browsers (OperaMini).

(function(){
  var g_fch;

  // Environment detection - Must match source logic
  window.g_mode_fetch = 3; // 1: file, 2: localhost, 3: online
  if(location.protocol === 'file:') window.g_mode_fetch = 1;
  if(location.host === 'localhost' || location.host === '127.0.0.1') window.g_mode_fetch = 2;

  // Global configuration
  window.g_fch = window.g_fch || {};
  g_fch = window.g_fch;
  g_fch.log = (g_fch.log === undefined) ? 1 : g_fch.log;
  g_fch.alert = (g_fch.alert === undefined) ? 1 : g_fch.alert;
  g_fch.timeout = g_fch.timeout || 10000;
  g_fch.file = (g_fch.file === undefined) ? 0 : g_fch.file; // Force sidecar mode
  g_fch.msg = '/';
  g_fch.busy = 0;

  // --- Internal Utilities ---

  function fch_get_table(txt, key, def, sep){ var lines, i, parts;
    lines = txt.split('\n').map(z=>z.trim()).filter(z=>z);
    sep = sep || '|';
    for(i=0; i<lines.length; i++){
      parts = (lines[i] + sep).split(sep).map(z=>z.trim());
      if(parts[0] === key) return parts[1];
    }
    return def;
  }

  function fch_msg(s, obj){
    if(!g_fch.log) return;
    var t = '[' + new Date().toLocaleTimeString() + '] ' + s;
    if(g_fch.msg) g_fch.msg += t + '\n';
    if(obj) console.log(t, obj); else console.log(t);
  }

  function fch_err(s){
    var t = 'Fetch Error: ' + s; fch_msg(t);
    if(g_fch.alert) alert(t); else throw new Error(t);
  }

  function fch_full_url(url){
    var u = '' + url;
    try { u = new URL(u, location.href).href; }catch(e){ fch_err(e); }
    return u;
  }

  function fch_clean_url(url){
    var u = fch_full_url(url);
    return u.split('?')[0].split('#')[0];
  }

  // Integrity Check: Rolling Hash (s * 31 + val) & 255
  function fch_ks(u8){ var i, sum;
    sum = 0;
    for(i=0; i<u8.length; i++) sum = (sum * 31 + u8[i]) & 255;
    return sum;
  }

  function fch_check_ks(u8, mode){
    if(!u8 || u8.length < 1){ fch_err('Empty array'); return null; }
    var res = u8.slice(0, -1), ks = u8[u8.length - 1];
    if(fch_ks(res) !== ks){ fch_err(`Checksum mismatch: ${mode} (expected=${ks})`); return null; }
    return res;
  }

  function fch_mime(url){
    var p, ext, types;
    p = fch_clean_url(url).toLowerCase();
    if(p.endsWith('.js.txt')) return 'text/javascript';
    ext = p.split('.').pop();
    types = `
wasm| application/wasm
js|   text/javascript
css|  text/css
htm|  text/html
html| text/html
png|  image/png
jpg|  image/jpeg
jpeg| image/jpeg
gif|  image/gif
svg|  image/svg+xml
mp4|  video/mp4
mp3|  audio/mpeg
`;
    return fch_get_table(types, ext, 'application/octet-stream', '|');
  }

  function fch_make_response(data, url, orig){
    var mime, blob, headers, res;
    mime = fch_mime(url);
    blob = data instanceof Blob ? data : new Blob([data], {type: mime});
    headers = new Headers(orig ? orig.headers : {});
    headers.set('Content-Type', mime);
    headers.set('Access-Control-Allow-Origin', '*');
    headers.set('Accept-Ranges', 'bytes');
    res = new Response(blob, {
      status: orig ? orig.status : 200,
      statusText: orig ? orig.statusText : 'OK',
      headers: headers
    });
    try { Object.defineProperty(res, 'url', {value: url, writable: false, configurable: true, enumerable: true}); }
    catch(e){ fch_msg('defineProperty error'); }
    return res;
  }

  // --- Decoders ---

  window.fch_dec64 = function(s){ var b, i, le, u, pos;
    if(s.substring(0, 5) === 'data:'){
      pos = s.indexOf(';base64,');
      if(pos !== -1) s = s.substring(pos + 8);
    }
    b = atob(s); le = b.length; u = new Uint8Array(le);
    for(i=0; i<le; i++) u[i] = b.charCodeAt(i);
    return u;
  };

  window.fch_dec85 = function(s){ var i, j, m, r, o, dv, p, t;
    t = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ.-:+=^!/*?&<>()[]{}@%$#";
    m = new Uint8Array(128); for(i=0; i<85; i++) m[t.charCodeAt(i)] = i;
    r = s.length % 5; p = s + (r ? "#".repeat(5 - r) : "");
    o = new Uint8Array(p.length / 5 * 4); dv = new DataView(o.buffer);
    for(i=0, j=0; i<p.length; i+=5, j+=4) dv.setUint32(j, m[p.charCodeAt(i)] * 52200625 + m[p.charCodeAt(i+1)] * 614125 + m[p.charCodeAt(i+2)] * 7225 + m[p.charCodeAt(i+3)] * 85 + m[p.charCodeAt(i+4)]);
    return r ? o.slice(0, r - 5) : o;
  };

  window.fch_dec122 = function(s){ var i, p, d, di, bb, bc, c, il, m;
    m = new Uint8Array([0, 10, 13, 34, 38, 92]);
    d = new Uint8Array(s.length * 2); di = 0; bb = 0; bc = 0;
    p = (b)=>{ bb = (bb << 7) | b; bc += 7; if(bc >= 8){ bc -= 8; d[di++] = (bb >>> bc) & 255; bb &= (1 << bc) - 1; } };
    for(i=0; i<s.length; i++){
      c = s.charCodeAt(i);
      if(c > 127){ il = (c >>> 8) & 7; if(il !== 7) p(m[il]); p(c & 127); } else p(c);
    }
    return d.slice(0, di);
  };

  function fch_decode_globals(name, mode, no_ks){ var d;
    if(!name){
      if(window.g_base64){ name='g_base64'; mode='64'; }
      else if(window.g_base85){ name='g_base85'; mode='85'; }
      else if(window.g_base122){ name='g_base122'; mode='122'; }
    }
    if(!name || !mode || !window[name]){ fch_msg('Manual check needed for '+name); return null; }
    d = window['fch_dec' + mode](window[name]); window[name] = '';
    if(!no_ks) d = fch_check_ks(d, 'Base' + mode);
    return d;
  }

  // --- Public APIs ---

  window.fch_DecodeUrl = function(data, url){
    var blob = new Blob([data], {type: fch_mime(url)});
    return URL.createObjectURL(blob);
  };

  window.fch_load_sidecar = async function(url, name, mode, no_ks){
    return new Promise((ok, er)=>{
      var sc, timer;
      timer = setTimeout(()=>{ sc.remove(); er('Timeout: ' + url); }, g_fch.timeout);
      sc = document.createElement('script');
      sc.src = url;
      sc.onload = ()=>{
        clearTimeout(timer); sc.remove();
        var d = fch_decode_globals(name, mode, no_ks);
        if(d) ok(d); else er('Load error: ' + url);
      };
      sc.onerror = ()=>{ clearTimeout(timer); sc.remove(); er('Not found: ' + url); };
      document.head.appendChild(sc);
    });
  };

  // --- Fetch Interceptor ---

  if(!window.fetch) alert('Fetch API not supported');
  if(!window.fch_orig) window.fch_orig = window.fetch;

  window.fetch = async function(url, init){
    var full, clean, b, res;
    if(typeof url !== 'string') return fch_orig(url, init);
    if(g_fch.busy){ alert('LocFetch BUSY'); return new Response(null, {status: 503}); }
    
    g_fch.busy = 1;
    window.g_base64 = window.g_base85 = window.g_base122 = '';
    
    try {
      full = fch_full_url(url); clean = fch_clean_url(url);
      
      // ORIGINAL LOGIC: only mode 1 (file) or explicit flag goes straight to sidecar
      if(window.g_mode_fetch === 1 || g_fch.file){
        b = await fch_load_sidecar(clean + '.js');
        return fch_make_response(b, full);
      }
      
      try {
        res = await fch_orig(full, init);
        if(!res.ok) throw new Error();
        b = await res.arrayBuffer();
        return fch_make_response(b, full, res);
      } catch(e1){
        fch_msg('Network fail, trying sidecar: ' + clean);
        try { b = await fch_load_sidecar(clean + '.js'); return fch_make_response(b, full); }
        catch(e2){ return new Response(null, {status: 404, statusText: e2}); }
      }
    } catch(e){ fch_err(e); }
    finally { g_fch.busy = 0; }
  };

})();
