// ============================================================
//  数据大屏接入源 — 增删改直接编辑此数组即可
// ============================================================
const EXTERN_URLS = [
    { label: '智慧云屏', url: 'https://road.xiangsu.work/bvr/zydlxc/#/homePage' },
    { label: '巡查管理', url: 'https://road.xiangsu.work/bvr/zydlxc/#/' },
    { label: '人员动态', url: '/peopledynamic' },
    { label: '数据大屏 4', url: '' }
];

const RP = { base: 'https://road.xiangsu.work/bvr/zydlxc', user: 'zydlxc', pass: '123456' };

// 工作版块配置
const workSections = [
    {
        title: 'A 研发管理', adminOnly: false,
        bg: '#2a0f1c', border: '#993556', color: '#e890b0',
        btnBg: '#3d1828', btnBorder: '#993556', btnColor: '#f4c0d1',
        items: [
            { label: '研发项目', url: '/admin/27i6nxausuo' }, { label: '研发记录', url: '/admin/mlvkttrutn1' },
            { label: '研发验收', url: '/admin/0un9a852apg' }, { label: '物料领用', url: '/admin/5qhb8a70wu4' },
            { label: '研发人员', url: '/admin/v2njcnsbexh' }, { label: '研发会议', url: '/admin/h3oc5ox3ofc' },
            { label: '研发费用', url: '/admin/1uruw7roe70' }, { label: '设备使用', url: '/admin/g6tm6f360cu' },
            { label: '研发工时', url: '/admin/m9o1l3mrwkc' }
        ]
    },
    {
        title: 'B 项目中心', adminOnly: false,
        bg: '#0f1f3d', border: '#185FA5', color: '#8cc4ff',
        btnBg: '#1a3055', btnBorder: '#185FA5', btnColor: '#b5d4f4',
        items: [
            { label: '项目清单', url: '/admin/40qzqh8cd2x' }, { label: '项目文档', url: '/admin/8hjlji4i5h5' },
            { label: '成本库', url: '/admin/upafwo9p17h' }, { label: '日志填报', url: '/admin/dgt7a1pvdcl' },
            { label: '施工日志', url: '/admin/z9k63jbjdne' }, { label: '安全会', url: '/admin/hbkmxfuybfa' },
            { label: '对甲计量', url: '/admin/glul693bqdq' },
            { label: '分包计价', url: '/admin/film1usvgbk' }
        ]
    },
    {
        title: 'C 物资采购', adminOnly: false,
        bg: '#0f2a20', border: '#0f6e56', color: '#5cccb0',
        btnBg: '#1a3d30', btnBorder: '#0f6e56', btnColor: '#9fe1cb',
        items: [
            { label: '物资库', url: '/admin/5a3kc0fhxej' }, { label: '供应商', url: '/admin/rogo0ybp3ec' },
            { label: '需求计划', url: '/admin/hlxtjlpu5hh' }, { label: '采购计划', url: '/admin/66ltbee018z' },
            { label: '采购订单', url: '/admin/4jjsg28hrsm' }, { label: '入库', url: '/admin/8osv18sq39r' },
            { label: '出库', url: '/admin/tttmn0y9sib' }, { label: '实时库存', url: '/admin/a074uemm4tv' },
            { label: '库存盘点', url: '/admin/5oemdodauf3' }, { label: '供应商结算', url: '/admin/d6425h7qboj' }
        ]
    },
    {
        title: 'D 合同管理', adminOnly: false,
        bg: '#2a1f0b', border: '#854F0B', color: '#f0b84d',
        btnBg: '#3d2e14', btnBorder: '#854F0B', btnColor: '#fac775',
        items: [
            { label: '合同库', url: '/admin/9xipt0adwpl' },
            { label: '合作准入', url: '/admin/6nztu3j1sb8' }
        ]
    },
    {
        title: 'E 财务行政', adminOnly: false,
        bg: '#2a180b', border: '#b86e20', color: '#f5c87a',
        btnBg: '#3d2614', btnBorder: '#b86e20', btnColor: '#fadb9a',
        items: [
            { label: '简报', url: '/admin/3s2h4vza3aj' }, { label: '财务收支', url: '/admin/o4idskohl9s' },
            { label: '公告通知', url: '/admin/lrxafsugcq9' }, { label: '考勤归档', url: '/admin/p12akdrns5t' },
            { label: '印章使用', url: '/admin/39dhaxha5bk' }
        ]
    },
    {
        title: 'F 基础数据', adminOnly: false,
        bg: '#1a1a2e', border: '#4a4e69', color: '#b0b5d4',
        btnBg: '#282840', btnBorder: '#4a4e69', btnColor: '#ced2e8',
        items: [
            { label: '资质库', url: '/admin/1tp44re032v' }, { label: '资质敏感信息', url: '/admin/iq36y670v9y' },
            { label: '制度文件', url: '/admin/2vi6wwjznbt' }, { label: '法规政策', url: '/admin/1bs22ati56u' },
            { label: '标准规范', url: '/admin/auhzptk1vby' }, { label: '模板库', url: '/admin/n637goaseda' },
            { label: '案例库', url: '/admin/zzfuii6gzbm' }, { label: '库存编辑', url: '/admin/d2rkuf3zrqw' }
        ]
    },
    {
        title: 'G 系统管理', adminOnly: true,
        bg: '#1a1a1a', border: '#5a5a5a', color: '#a0a0a0',
        btnBg: '#2a2a2a', btnBorder: '#5a5a5a', btnColor: '#c0c0c0',
        items: [
            { label: '流程日志', url: '/admin/lk63lo7m7ak' }, { label: '审批记录', url: '/admin/iw8mm62qjqc' },
            { label: '自动计数器', url: '/admin/imnv1lw5bkb' }
        ]
    }
];
