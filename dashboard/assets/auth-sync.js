(function(){
  var m = window.location.search.match(/[?&]token=([^&]+)/);
  if (!m) return;
  var token = decodeURIComponent(m[1]);
  try {
    localStorage.setItem('NOCOBASE_TOKEN', token);
    localStorage.setItem('nocobase_token', token);
    document.cookie = 'nb_token=' + token + ';path=/;max-age=3600;SameSite=Lax';
    var u = window.location.href.replace(/[?&]token=[^&]+/, '');
    u = u.replace(/([?&])&+/, '$1').replace(/[?&]$/, '');
    history.replaceState(null, '', u);
  } catch(e) {}
})();
