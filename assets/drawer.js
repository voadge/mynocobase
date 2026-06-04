// === 抽屉控制器 ===
var _drawerOpen = false;

function openDrawer(url, title) {
    document.getElementById('adminFrame').src = url;
    document.getElementById('adminDrawer').classList.add('show');
    _drawerOpen = true;
}

function closeDrawer() {
    document.getElementById('adminDrawer').classList.remove('show');
    setTimeout(function() { document.getElementById('adminFrame').src = ''; }, 300);
    _drawerOpen = false;
}

function openDrawerNewTab() {
    var frame = document.getElementById('adminFrame');
    if (frame.src) window.open(frame.src, '_blank');
}

document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape' && _drawerOpen) closeDrawer();
});

document.getElementById('adminDrawer').addEventListener('click', function(e) {
    if (e.target === this) closeDrawer();
});


