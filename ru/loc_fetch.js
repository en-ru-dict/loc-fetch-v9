///XingSoft*2026 /либа делает замену fetch() и правит CORS + MIME
// --- LocFetch Engine (v9) /Protocol: Data[0...N-1] + Checksum[N]
// Checksum Algorithm: Rolling Hash (s * 31 + val) & 255
// поддержка Sidecar.js (base64/85/122) + защита от зависания при загрузке скриптов
// Максимальная совместимость (2020+, Mobile, OperaMini)

window.g_mode_fetch = 3; // 1: file, 2: localhost, 3: online
if(window.location.protocol === 'file:') window.g_mode_fetch = 1;
if(window.location.host === 'localhost' || window.location.host === '127.0.0.1') window.g_mode_fetch = 2;

// Глобальные настройки управления (можно задавать до загрузки либы или менять после)
if(window.g_fch === undefined)  window.g_fch = {}; //создаем если нету
if(g_fch.log === undefined)     g_fch.log = 1; //для отладки
if(g_fch.alert === undefined)   g_fch.alert = 1; //для отладки
if(g_fch.timeout === undefined) g_fch.timeout = 10000;//если скрипты большие то увеличить
if(g_fch.file === undefined)    g_fch.file = 0; //режим одного источника ищет .js на сервере и локально, вызов через await!
g_fch.msg = '/'; //если пусто, то не пишет (для отладки на мобильных)
g_fch.busy = 0; //флаг занято только для локального режима

//универсальные утилиты
function fch_get_tabl(txt,key,val,x){ var m, i, s; //val-знач по умолчанию, x-разделитель(|-по умолчанию)
  m = txt.split('\n').map(z=>z.trim()).filter(z=>z);
  x = (x)? x : '|';
  for(i=0; i<m.length; i++){
    s = m[i]+x; s = s.split(x).map(z=>z.trim());
    if(s[0] === key) return s[1];//key может быть пустым
  }
  return val;
}
// --- Секция: Логирование и Ошибки ---
function fch_msg(s,o){
  if(!g_fch.log) return;
  var t = '[' + new Date().toLocaleTimeString() + '] ' + s;
  if(g_fch.msg) g_fch.msg += t + '\n';
  if(o) console.log(t,o); else console.log(t);
}
function fch_err(s){
  var t = 'Fetch Error: ' + s; fch_msg(t);
  if(g_fch.alert) alert(t);
  else {throw new Error(t);}
}
// --- Работа с URL ---
function fch_full_url(url){
 var u=''+url;
 try { u= new URL(u, location.href).href; }
 catch(e) {fch_err(e);}
 return u;
}
function fch_clean_url(url){
 var u=''+url;
 // Отрезаем ?query и #hash для определения MIME и поиска sidecar.js
 u=fch_full_url(u); u=u.split('?')[0]; u=u.split('#')[0];
 return u;
}
// --- Контроль целостности ---
function fch_ks(u8){ var i,sum=0;
  // Классический цикл - самый быстрый для мобильных движков
  for(i=0; i < u8.length; i++) sum = (sum * 31 + u8[i]) & 255;
  return sum & 255;
}
function fch_check_ks(u8,mode){
  if(!u8 || u8.length < 1) {fch_err('пустой массив?'); return null;}
  var res = u8.slice(0, -1), ks = u8[u8.length - 1];
  if(fch_ks(res) !== ks){
    fch_err(`Ошибка КС: ${mode} (ожидали=${ks})`);
    return null;
  }
  return res;
}
// --- Парсинг и MIME ---

function fch_mime(url){
 var p = fch_clean_url(url); p = p.toLowerCase();
 if(p.endsWith('.js.txt')) return 'text/javascript';
 var ext = p.split('.').pop();
 var types = `
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
`;//таблица - легко добавить строку. можно таб разделитель или ,;/
 return fch_get_tabl(types,ext,'application/octet-stream','|');
}
function fch_make_NativeResponse(data,url,origRes){
  var mime = fch_mime(url);
  // Blob - лучший выбор для совместимости с медиа и WASM 
  var blob = data instanceof Blob ? data : new Blob([data], { type: mime });
  var h = new Headers(origRes ? origRes.headers : {});
  h.set('Content-Type', mime);
  h.set('Access-Control-Allow-Origin', '*');
  h.set('Accept-Ranges', 'bytes');

  var res = new Response(blob, {
    status: origRes ? origRes.status : 200,
    statusText: origRes ? origRes.statusText : 'OK',
    headers: h
  });
  // Критично для совместимости с библиотеками (sql-wasm, pyodide и др.)
  try { Object.defineProperty(res,'url',{value:url, writable:false, configurable:true, enumerable:true});}
  catch(e){ fch_msg('fch_make_NativeResponse: Object.defineProperty err'); }
  return res;
}
// --- Секция: Декодеры нормальная (из fetch_sidecar_js)---
function fch_dec64(s){var b,le,u,i,pos;
  if(s.substring(0,5)==='data:'){
    pos=s.indexOf(';base64,');
    if(pos!==-1) s=s.substring(pos+8);
  }
  b = atob(s); le = b.length; u = new Uint8Array(le);
  for(i = 0; i < le; i++) u[i] = b.charCodeAt(i);
  return u;
}
function fch_dec85(s){ var i,j,m,r,o,dv,p,t;
  t = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ.-:+=^!/*?&<>()[]{}@%$#";
  m = new Uint8Array(128); for(i=0;i<85;i++) m[t.charCodeAt(i)]=i;
  r = s.length % 5; p = s + (r ? "#".repeat(5 - r) : "");
  o = new Uint8Array(p.length / 5 * 4); dv = new DataView(o.buffer);
  for(i=0,j=0; i < p.length; i+=5,j+=4) dv.setUint32(j, m[p.charCodeAt(i)] * 52200625 + m[p.charCodeAt(i + 1)] * 614125 + m[p.charCodeAt(i + 2)] * 7225 + m[p.charCodeAt(i + 3)] * 85 + m[p.charCodeAt(i + 4)]);
  return r ? o.slice(0, r-5) : o;
}
function fch_dec122(s){var i,p,d,di,bb,bc,c,il,m;
  m = new Uint8Array([0,10,13,34,38,92]);
  d = new Uint8Array(s.length * 2);
  di = 0; bb = 0; bc = 0;
  p = (b)=>{ bb = (bb << 7) | b; bc += 7; if(bc >= 8){ bc -= 8; d[di++] = (bb >>> bc) & 255; bb &= (1 << bc) - 1; } };
  for(i = 0; i < s.length; i++){ c = s.charCodeAt(i); if(c > 127){ il = (c >>> 8) & 7; if(il !== 7) p(m[il]); p(c & 127); } else p(c); }
  return d.slice(0,di);
}
// Обработка Sidecar (Данные из внешних скриптов) ---
function fch_decode_from_globals(name,mode,no_ks){ var d;
  if(!name){
   if(window.g_base64){ name='g_base64'; mode='64';}
   else if(window.g_base85){ name='g_base85'; mode='85';}
   else if(window.g_base122){ name='g_base122'; mode='122';}
  }
   if(!name){alert('fch_decode_from_globals: name?');return null;}
   if(!mode){alert('fch_decode_from_globals: mode?');return null;}
   if(!window[name]){alert('fch_decode_from_globals: нет var='+name);return null;}
    d=window['fch_dec'+mode](window[name]); window[name]='';
    if(!no_ks) d=fch_check_ks(d,'Base'+mode);
    return (d)? d : null;
}
// Публичный метод для декодирования и получения URL (если скрипт загружен вручную)
function fch_DecodeUrl(data,url){
  var mime = fch_mime(url);
  var blob = new Blob([data], { type: mime });
  return URL.createObjectURL(blob);
}
// Загрузка sidecar.js через динамический скрипт
async function fch_load_sidecar(url,name,mode,no_ks){
  return new Promise((ok,er)=>{
  var timer = setTimeout(() => {
    sc.remove();
    er('Timeout: Sidecar завис или ошибка в коде? ' + url);
  }, g_fch.timeout);

    var sc = document.createElement('script');
    sc.src = url;
    sc.onload = ()=>{
      clearTimeout(timer); sc.remove();
      var d = fch_decode_from_globals(name,mode,no_ks); 
      if(d) ok(d); else er('Ошибка загрузки sidecar=' + url);
    };
    sc.onerror = ()=>{clearTimeout(timer); sc.remove(); er('Sidecar.js нет?: ' + url);};
    document.head.appendChild(sc);
  });
}

// ================ ПЕРЕХВАТЧИК FETCH ====================
 if(window.fetch === undefined){alert('fetch не поддерживается, обновите браузер');}
 if(window.fch_orig === undefined) window.fch_orig = window.fetch;

 window.fetch = async function(url,init){var res,b,full_url;
  // если fetch(new Request(url)) то вызываем сразу оригигальный fetch, значит не хотим через перехватчик!
  if(typeof url !== 'string') return fch_orig(url,init);
  // Проверка состояния (только один запрос за раз)
  if(g_fch.busy){
    alert("LocFetch BUSY: вызывать только через await! или надо грузить нес-ко sidecar.js асинхронно и декодировать, но имена переменных внутри должны быть разные");
    return new Response(null, {status: 503, statusText: 'BUSY'});
  }
  g_fch.busy = 1;
  window.g_base64=window.g_base85=window.g_base122 = ''; // очистка и создание
  try {
   full_url = fch_full_url(url);
   url = fch_clean_url(url);
   // 1. РЕЖИМ ЛОКАЛЬНОГО SIDECAR (file:// или принудительно через флаг один источник)
   if(window.g_mode_fetch === 1 || g_fch.file){
     b = await fch_load_sidecar(url+'.js');
     return fch_make_NativeResponse(b,full_url);
   }
   // 2. СЕТЕВОЙ ЗАПРОС
   try {
    res = await fch_orig(full_url,init); if(!res.ok) throw new Error();
    b = await res.arrayBuffer();
    return fch_make_NativeResponse(b,full_url,res);
   }
   catch(e1){//а вот тут если нету, то можно еще sidecar.js поискать вдруг есть на сервере
    fch_msg('По сети такого нету, поищем sidecar: ' + url);
    try { b = await fch_load_sidecar(url+'.js'); return fch_make_NativeResponse(b,full_url); }
    catch(e2) { return new Response(null, {status: 404, statusText: e2}); }
   }
  }
  catch(e){fch_err(e);}
  finally { g_fch.busy = 0; }
  };
