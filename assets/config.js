// ============================================================
//  数据大屏接入源 — 增删改直接编辑此数组即可
// ============================================================
const EXTERN_URLS = [
    { label: '智慧云屏', url: 'https://road.xiangsu.work/bvr/zydlxc/#/homePage' },
    { label: '巡查管理', url: 'https://road.xiangsu.work/bvr/zydlxc/#/' },
    { label: '数据大屏 2', url: 'https://example.com' }
];

const RP = { base: 'https://road.xiangsu.work/bvr/zydlxc', user: 'zydlxc', pass: '123456' };

// 工作版块配置
const workSections = [
    {
        title: 'A 研发管理', adminOnly: false,
        bg: '#2a0f1c', border: '#993556', color: '#e890b0',
        btnBg: '#3d1828', btnBorder: '#993556', btnColor: '#f4c0d1',
        items: [
            { label: '研发项目', url: '/admin/gmhyblvl16o' }, { label: '研发记录', url: '/admin/s6j338yz3i2' },
            { label: '研发归档', url: '/admin/5ty5vupwq62' }, { label: '研发验收', url: '/admin/quezp14dok9' },
            { label: '物料领用', url: '/admin/ola7umdnmyz' }, { label: '研发人员', url: '/admin/n3nft95ki1w' },
            { label: '研发会议', url: '/admin/x23rf37jxb1' }, { label: '研发费用', url: '/admin/ogybv5ukbwg' },
            { label: '设备使用', url: '/admin/4uwkfqpz781' }, { label: '研发工时', url: '/admin/8wtfmqucj1p' }
        ]
    },
    {
        title: 'B 项目中心', adminOnly: false,
        bg: '#0f1f3d', border: '#185FA5', color: '#8cc4ff',
        btnBg: '#1a3055', btnBorder: '#185FA5', btnColor: '#b5d4f4',
        items: [
            { label: '项目清单', url: '/admin/nzqtepnaklg' }, { label: '项目文档', url: '/admin/pamw08zpag6' },
            { label: '成本库', url: '/admin/visdef7mujx' }, { label: '日志填报', url: '/admin/95q6zzzqj9' },
            { label: '施工日志', url: '/admin/68nvr7tszqj' }, { label: '安全会', url: '/admin/y25rk07pr6z' },
            { label: '日常报备', url: '/admin/oa082ymyhpc' }, { label: '对甲计量', url: '/admin/hkcwvuo9l4d' },
            { label: '分包计价', url: '/admin/pbb3clqs91a' }
        ]
    },
    {
        title: 'C 物资采购', adminOnly: false,
        bg: '#0f2a20', border: '#0f6e56', color: '#5cccb0',
        btnBg: '#1a3d30', btnBorder: '#0f6e56', btnColor: '#9fe1cb',
        items: [
            { label: '物资库', url: '/admin/ui1d106a3c' }, { label: '供应商', url: '/admin/uibab268d5' },
            { label: '需求计划', url: '/admin/uia3ab7463' }, { label: '采购计划', url: '/admin/uid1b5e817' },
            { label: '采购订单', url: '/admin/ui5d66371c' }, { label: '入库', url: '/admin/uiaeaa7f29' },
            { label: '出库', url: '/admin/ui6dd4eb4d' }, { label: '实时库存', url: '/admin/uic0c97799' },
            { label: '库存盘点', url: '/admin/uica2dba0b' }, { label: '供应商结算', url: '/admin/960ews9jibd' }
        ]
    },
    {
        title: 'D 合同管理', adminOnly: false,
        bg: '#2a1f0b', border: '#854F0B', color: '#f0b84d',
        btnBg: '#3d2e14', btnBorder: '#854F0B', btnColor: '#fac775',
        items: [
            { label: '合同库', url: '/admin/01zkrtol7d6' }, { label: '供应商信息', url: '/admin/gqak47qsuaw' },
            { label: '合作准入', url: '/admin/kyg3ldnu62j' }, { label: '付款台账', url: '/admin/7v5y1hyfm7m' }
        ]
    },
    {
        title: 'E 财务行政', adminOnly: false,
        bg: '#2a180b', border: '#b86e20', color: '#f5c87a',
        btnBg: '#3d2614', btnBorder: '#b86e20', btnColor: '#fadb9a',
        items: [
            { label: '简报', url: '/admin/fq6eb3defao' }, { label: '财务收支', url: '/admin/lmrskqik2tm' },
            { label: '公告通知', url: '/admin/1leztg7ou2e' }, { label: '考勤归档', url: '/admin/5qtc3r5n88q' },
            { label: '印章使用', url: '/admin/6lr55tm1glf' }
        ]
    },
    {
        title: 'F 基础数据', adminOnly: false,
        bg: '#1a1a2e', border: '#4a4e69', color: '#b0b5d4',
        btnBg: '#282840', btnBorder: '#4a4e69', btnColor: '#ced2e8',
        items: [
            { label: '资质库', url: '/admin/o4kg2kwmgur' }, { label: '资质敏感信息', url: '/admin/hn8ke2a9zcu' },
            { label: '制度文件', url: '/admin/sbitmdfbp8d' }, { label: '法规政策', url: '/admin/fizelzr1x6d' },
            { label: '标准规范', url: '/admin/ol23gcsrb0x' }, { label: '模板库', url: '/admin/plo1hmfn8pq' },
            { label: '案例库', url: '/admin/ey91jn5cxvm' }, { label: '库存编辑', url: '/admin/o4xcn0t982s' }
        ]
    },
    {
        title: 'G 系统管理', adminOnly: true,
        bg: '#1a1a1a', border: '#5a5a5a', color: '#a0a0a0',
        btnBg: '#2a2a2a', btnBorder: '#5a5a5a', btnColor: '#c0c0c0',
        items: [
            { label: '流程日志', url: '/admin/w1l9qyr5ro4' }, { label: '审批记录', url: '/admin/spmliaim71h' },
            { label: '自动计数器', url: '/admin/n9ofrd7cctn' }
        ]
    }
];
