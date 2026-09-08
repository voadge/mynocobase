(function(){
  try {
    var token = '';
    var m = window.location.search.match(/[?&]token=([^&]+)/);
    if (m) {
      token = decodeURIComponent(m[1]);
      localStorage.setItem('NOCOBASE_TOKEN', token);
      localStorage.setItem('nocobase_token', token);
    } else {
      token = localStorage.getItem('NOCOBASE_TOKEN') || localStorage.getItem('nocobase_token') || '';
    }
    if (token && token.length > 20) {
      document.cookie = 'nb_token=' + token + ';path=/;max-age=604800;SameSite=Lax';
    } else if (window.location.pathname === '/signin') {
      document.cookie = 'nb_token=;path=/;max-age=0;SameSite=Lax';
    }
    if (m) {
      var u = window.location.href.replace(/[?&]token=[^&]+/, '');
      u = u.replace(/([?&])&+/, '$1').replace(/[?&]$/, '');
      history.replaceState(null, '', u);
    }
  } catch(e) {}
})();

(function(){
  try {
    if ('serviceWorker' in navigator && location.protocol === 'https:') {
      navigator.serviceWorker.register('/dashboard/precache.js', { scope: '/' }).catch(function(){});
    }
  } catch(e) {}
})();
