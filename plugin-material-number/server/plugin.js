const { Plugin } = require('@nocobase/server');
const pinyin = require('pinyin-pro');

class MaterialNumberPlugin extends Plugin {
  async load() {
    const collection = this.db.getCollection('scm_materials');
    if (!collection) {
      console.warn('[MaterialNumber] scm_materials collection not found');
      return;
    }

    collection.model.addHook('beforeCreate', async (instance) => {
      if (instance.get('type') !== 'spec') return;

      const repo = this.db.getRepository('scm_materials');
      if (!repo) return;

      let parentId = instance.get('parentId');
      if (!parentId) return;

      let categoryName = '';
      const visited = new Set();

      while (parentId && !visited.has(parentId)) {
        visited.add(parentId);
        const parent = await repo.findOne({ filter: { id: parentId } });
        if (!parent) break;
        if (parent.get('type') === 'category') {
          categoryName = parent.get('material_name') || '';
          break;
        }
        parentId = parent.get('parentId');
      }

      if (!categoryName || categoryName.length < 2) return;

      const firstTwo = categoryName.substring(0, 2);
      const pinyinResult = pinyin(firstTwo, { pattern: 'first', toneType: 'none' });
      const prefix = pinyinResult.toUpperCase();

      const lastRecord = await repo.findOne({
        filter: { material_no: { $startsWith: prefix } },
        sort: ['-material_no'],
      });

      let seq = 1;
      if (lastRecord) {
        const lastNo = lastRecord.get('material_no') || '';
        const lastSeq = parseInt(lastNo.substring(prefix.length), 10);
        if (!isNaN(lastSeq)) seq = lastSeq + 1;
      }

      instance.set('material_no', prefix + seq.toString().padStart(8, '0'));
    });
  }
}

module.exports = MaterialNumberPlugin;
