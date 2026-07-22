const app = getApp();

var workSections = [
  { title: 'A 科技研发', accent: '#993556', items: [
    { label: '研发项目', url: '/admin/27i6nxausuo' }, { label: '研发人员', url: '/admin/v2njcnsbexh' },
    { label: '研发记录', url: '/admin/mlvkttrutn1' }, { label: '设备使用', url: '/admin/g6tm6f360cu' },
    { label: '物料领用', url: '/admin/5qhb8a70wu4' }, { label: '研发会议', url: '/admin/h3oc5ox3ofc' },
    { label: '研发费用', url: '/admin/1uruw7roe70' }, { label: '研发验收', url: '/admin/0un9a852apg' },
    { label: '研发资料', url: '/admin/ji9k5m339bc' }, { label: '研发工时', url: '/admin/m9o1l3mrwkc' }
  ]},
  { title: 'B 项目实施', accent: '#185FA5', items: [
    { label: '日志填报', url: '/admin/dgt7a1pvdcl' }, { label: '施工日志', url: '/admin/z9k63jbjdne' },
    { label: '临时新增-报备', url: '/admin/q03hdwvntli' }, { label: '施工安全', url: '/admin/hbkmxfuybfa' },
    { label: '对甲计量', url: '/admin/glul693bqdq' }, { label: '项目清单', url: '/admin/40qzqh8cd2x' },
    { label: '分包计价', url: '/admin/film1usvgbk' }, { label: '项目文档', url: '/admin/8hjlji4i5h5' },
    { label: '成本库', url: '/admin/upafwo9p17h' }
  ]},
  { title: 'C 物资采购', accent: '#0f6e56', items: [
    { label: '需求计划', url: '/admin/hlxtjlpu5hh' }, { label: '采购计划', url: '/admin/66ltbee018z' },
    { label: '采购订单', url: '/admin/4jjsg28hrsm' }, { label: '入库', url: '/admin/8osv18sq39r' },
    { label: '出库', url: '/admin/tttmn0y9sib' }, { label: '实时库存', url: '/admin/a074uemm4tv' },
    { label: '库存盘点', url: '/admin/5oemdodauf3' }, { label: '库存编辑', url: '/admin/d2rkuf3zrqw' },
    { label: '供应商结算', url: '/admin/d6425h7qboj' }, { label: '物资库', url: '/admin/5a3kc0fhxej' }
  ]},
  { title: 'D 常用流程', accent: '#854F0B', items: [
    { label: '首页', url: '/admin/ffw9h2yb5cp' }
  ]},
  { title: 'E 财务行政', accent: '#b86e20', items: [
    { label: '财务收支', url: '/admin/o4idskohl9s' }, { label: '印章使用', url: '/admin/39dhaxha5bk' },
    { label: '考勤打卡', url: '/admin/euq1r808ipn' }, { label: '考勤归档', url: '/admin/p12akdrns5t' },
    { label: '公告通知', url: '/admin/lrxafsugcq9' }, { label: '合作方准入', url: '/admin/6nztu3j1sb8' },
    { label: '资质敏感信息', url: '/admin/iq36y670v9y' }, { label: '供应商', url: '/admin/rogo0ybp3ec' }
  ]},
  { title: 'F 基础数据', accent: '#4a4e69', items: [
    { label: '合同库', url: '/admin/9xipt0adwpl' }, { label: '标准规范', url: '/admin/auhzptk1vby' },
    { label: '法规政策', url: '/admin/1bs22ati56u' }, { label: '制度流程', url: '/admin/2vi6wwjznbt' },
    { label: '案例库', url: '/admin/zzfuii6gzbm' }, { label: '资质库', url: '/admin/1tp44re032v' },
    { label: '模板库', url: '/admin/n637goaseda' }
  ]}
];

Page({
  data: {
    workSections: [],
    token: '',
    theme: 'light'
  },

  onLoad() {
    const token = wx.getStorageSync('token') || app.globalData.token || '';
    if (!token) { wx.reLaunch({ url: '/pages/index/index' }); return; }
    const sys = wx.getSystemInfoSync();
    this.setData({ token, workSections, theme: sys.theme || 'light' });
  },

  onThemeChange() {
    const sys = wx.getSystemInfoSync();
    this.setData({ theme: sys.theme || 'light' });
  },

  goAttend() {
    wx.navigateTo({ url: '/pages/attend/attend' });
  },

  goWebview(e) {
    const url = e.currentTarget.dataset.url;
    if (!url) return;
    wx.navigateTo({ url: '/pages/webview/webview?url=' + encodeURIComponent(url) });
  }
});
