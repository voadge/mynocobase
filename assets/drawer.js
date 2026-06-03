// === 抽屉控制器 ===
var _drawerOpen = false;

function openDrawer(url, title) {
    document.getElementById('adminFrame').src = url;
    document.getElementById('drawerTitle').textContent = title;
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

document.getElementById('adminFrame').addEventListener('load', function() {
    try {
        var doc = this.contentDocument || this.contentWindow.document;
        if (!doc) return;
        var style = doc.createElement('style');
        style.textContent = '.ant-layout-header, .ant-layout-sider-trigger, .nocobase-header, .nocobase-layout-header { display: none !important; }';
        doc.head.appendChild(style);
    } catch(e) {}
});
