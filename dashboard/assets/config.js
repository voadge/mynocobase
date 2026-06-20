// ============================================================
//  数据大屏接入源 — 增删改直接编辑此数组即可
// ============================================================
// ============================================================
//  数据大屏接入源 — dashboard/index.html + 根 index.html 共用
//  增删改直接编辑此数组，dashboard/index.html 和根 index.html 均引用之
// ============================================================
const EXTERN_URLS = [
    { label: '智慧云屏', url: 'https://road.xiangsu.work/bvr/zydlxc/#/homePage' },
    { label: '巡查管理', url: 'https://road.xiangsu.work/bvr/zydlxc/#/' },
    { label: '人员动态', url: '/peopledynamic' },
    { label: '数据大屏 4', url: '' }
];

const RP = { base: 'https://road.xiangsu.work/bvr/zydlxc', user: 'zydlxc', pass: '123456' };
const NOCOBASE_HOME = '/admin/ffw9h2yb5cp';

// 工作版块配置 — 与 dashboard/index.html 内联数据保持同步
const workSections = [
    {
        title: 'A 科技研发', adminOnly: false,
        bg: '#2a0f1c', border: '#993556', color: '#e890b0',
        btnBg: '#3d1828', btnBorder: '#993556', btnColor: '#f4c0d1',
        items: [
            { label: '研发项目', url: '/admin/27i6nxausuo' }, { label: '研发人员', url: '/admin/v2njcnsbexh' },
            { label: '研发记录', url: '/admin/mlvkttrutn1' }, { label: '设备使用', url: '/admin/g6tm6f360cu' },
            { label: '物料领用', url: '/admin/5qhb8a70wu4' }, { label: '研发会议', url: '/admin/h3oc5ox3ofc' },
            { label: '研发费用', url: '/admin/1uruw7roe70' }, { label: '研发验收', url: '/admin/0un9a852apg' },
            { label: '研发资料', url: '/admin/ji9k5m339bc' }, { label: '研发工时', url: '/admin/m9o1l3mrwkc' }
        ]
    },
    {
        title: 'B 项目实施', adminOnly: false,
        bg: '#0f1f3d', border: '#185FA5', color: '#8cc4ff',
        btnBg: '#1a3055', btnBorder: '#185FA5', btnColor: '#b5d4f4',
        items: [
            { label: '日志填报', url: '/admin/dgt7a1pvdcl' }, { label: '施工日志', url: '/admin/z9k63jbjdne' },
            { label: '临时新增-报备', url: '/admin/q03hdwvntli' }, { label: '施工安全', url: '/admin/hbkmxfuybfa' },
            { label: '对甲计量', url: '/admin/glul693bqdq' }, { label: '项目清单', url: '/admin/40qzqh8cd2x' },
            { label: '分包计价', url: '/admin/film1usvgbk' }, { label: '项目文档', url: '/admin/8hjlji4i5h5' },
            { label: '成本库', url: '/admin/upafwo9p17h' }
        ]
    },
    {
        title: 'C 物资采购', adminOnly: false,
        bg: '#0f2a20', border: '#0f6e56', color: '#5cccb0',
        btnBg: '#1a3d30', btnBorder: '#0f6e56', btnColor: '#9fe1cb',
        items: [
            { label: '需求计划', url: '/admin/hlxtjlpu5hh' }, { label: '采购计划', url: '/admin/66ltbee018z' },
            { label: '采购订单', url: '/admin/4jjsg28hrsm' }, { label: '入库', url: '/admin/8osv18sq39r' },
            { label: '出库', url: '/admin/tttmn0y9sib' }, { label: '实时库存', url: '/admin/a074uemm4tv' },
            { label: '库存盘点', url: '/admin/5oemdodauf3' }, { label: '库存编辑', url: '/admin/d2rkuf3zrqw' },
            { label: '供应商结算', url: '/admin/d6425h7qboj' }, { label: '物资库', url: '/admin/5a3kc0fhxej' }
        ]
    },
    {
        title: 'D 常用流程', adminOnly: false,
        bg: '#2a1f0b', border: '#854F0B', color: '#f0b84d',
        btnBg: '#3d2e14', btnBorder: '#854F0B', btnColor: '#fac775',
        items: [
            { label: '首页', url: '/admin/ffw9h2yb5cp' }
        ]
    },
    {
        title: 'E 财务行政', adminOnly: false,
        bg: '#2a180b', border: '#b86e20', color: '#f5c87a',
        btnBg: '#3d2614', btnBorder: '#b86e20', btnColor: '#fadb9a',
        items: [
            { label: '财务收支', url: '/admin/o4idskohl9s' }, { label: '印章使用', url: '/admin/39dhaxha5bk' },
            { label: '考勤打卡', url: '/admin/euq1r808ipn' }, { label: '考勤归档', url: '/admin/p12akdrns5t' },
            { label: '公告通知', url: '/admin/lrxafsugcq9' }, { label: '合作方准入', url: '/admin/6nztu3j1sb8' },
            { label: '资质敏感信息', url: '/admin/iq36y670v9y' }, { label: '供应商', url: '/admin/rogo0ybp3ec' }
        ]
    },
    {
        title: 'F 基础数据', adminOnly: false,
        bg: '#1a1a2e', border: '#4a4e69', color: '#b0b5d4',
        btnBg: '#282840', btnBorder: '#4a4e69', btnColor: '#ced2e8',
        items: [
            { label: '合同库', url: '/admin/9xipt0adwpl' }, { label: '标准规范', url: '/admin/auhzptk1vby' },
            { label: '法规政策', url: '/admin/1bs22ati56u' }, { label: '制度流程', url: '/admin/2vi6wwjznbt' },
            { label: '案例库', url: '/admin/zzfuii6gzbm' }, { label: '资质库', url: '/admin/1tp44re032v' },
            { label: '模板库', url: '/admin/n637goaseda' }
        ]
    }
];
