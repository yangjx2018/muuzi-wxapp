/**
 * 合集判定 · 对齐 MuuziGit `services/collections.ts`
 */
var COLLECTION_LAYOUTS = [
  { id: 'list', label: '列表', icon: 'list' },
  { id: 'grid', label: '网格', icon: 'grid' },
  { id: 'carousel', label: '轮播', icon: 'carousel' },
  { id: 'showcase', label: '重点展示', icon: 'showcase' },
];

function isLinkCollection(section) {
  if (!section || section.collection_id) return false;
  if ((section.type || 'links') !== 'links') return false;
  return Boolean(
    section.collection_layout ||
      section.title ||
      (section.items || []).length !== 1
  );
}

function collectionMemberCount(section, sections) {
  if (!section) return 0;
  var id = section.id;
  var n = (section.items || []).length;
  (sections || []).forEach(function (child) {
    if (child.collection_id === id) {
      n += (child.items || []).length;
    }
  });
  return n;
}

function titleOfItem(item) {
  if (!item) return '未命名内容';
  return item.label || item.title || item.name || item.social_provider || '未命名内容';
}

function providerFor(item) {
  if (!item) return '';
  var known = { instagram: 1, tiktok: 1, youtube: 1 };
  if (item.social_provider && known[item.social_provider]) {
    return item.social_provider;
  }
  try {
    var href = String(item.url || '');
    if (href.indexOf('https://') !== 0) return '';
    var host = href
      .replace(/^https:\/\//i, '')
      .split('/')[0]
      .replace(/^www\./i, '')
      .toLowerCase();
    if (host === 'instagram.com') return 'instagram';
    if (host === 'tiktok.com') return 'tiktok';
    if (host === 'youtube.com' || host === 'youtu.be') return 'youtube';
  } catch (e) {}
  return '';
}

/**
 * 移出合集 · 对齐 App moveCollectionLink(..., targetId=null)
 */
function removeFromCollection(sections, sourceId, itemIndex, newId) {
  return moveCollectionLink(sections, sourceId, itemIndex, null, newId);
}

/**
 * 移动内容到合集 / 移出 · 对齐 App `moveCollectionLink`
 */
function moveCollectionLink(sections, sourceId, itemIndex, targetId, newId) {
  var source = null;
  var target = null;
  var sourceIdx = -1;
  for (var i = 0; i < sections.length; i++) {
    if (sections[i].id === sourceId) {
      source = sections[i];
      sourceIdx = i;
    }
    if (targetId && sections[i].id === targetId) target = sections[i];
  }
  if (!source || !Number.isInteger(itemIndex) || !source.items[itemIndex]) {
    throw new Error('这条链接已更改，请重新选择');
  }
  if (targetId === sourceId || (targetId && targetId === source.collection_id)) {
    return sections;
  }
  if (targetId && (!target || !isLinkCollection(target))) {
    throw new Error('目标合集已不存在');
  }
  if (target) {
    var count =
      (target.items || []).length +
      sections
        .filter(function (s) {
          return s.collection_id === target.id;
        })
        .reduce(function (n, s) {
          return n + (s.items || []).length;
        }, 0);
    if (count >= 12) throw new Error('每个合集最多 12 张内容卡片');
  }

  if ((source.type || 'links') !== 'links' || source.collection_id) {
    if ((source.items || []).length === 1) {
      return sections.map(function (s) {
        if (s.id === sourceId) {
          var next = Object.assign({}, s);
          if (targetId) next.collection_id = targetId;
          else delete next.collection_id;
          return next;
        }
        if (target && s.id === target.id) {
          return Object.assign({}, s, {
            collection_layout: s.collection_layout || 'list',
          });
        }
        return s;
      });
    }
    if (sections.length >= 8) {
      throw new Error('最多 8 张卡片或合集，请先腾出位置');
    }
    if (
      sections.some(function (s) {
        return s.id === newId;
      })
    ) {
      throw new Error('新卡片编号重复，请重试');
    }
    var splitItem = source.items[itemIndex];
    var afterSplit = sections.map(function (s) {
      if (s.id === sourceId) {
        return Object.assign({}, s, {
          items: s.items.filter(function (_, idx) {
            return idx !== itemIndex;
          }),
        });
      }
      if (target && s.id === target.id) {
        return Object.assign({}, s, {
          collection_layout: s.collection_layout || 'list',
        });
      }
      return s;
    });
    var nested = Object.assign({}, source, {
      id: newId,
      title: '',
      items: [splitItem],
    });
    if (targetId) nested.collection_id = targetId;
    else delete nested.collection_id;
    afterSplit.push(nested);
    return afterSplit;
  }

  var removeSource = !isLinkCollection(source) && source.items.length === 1;
  if (!target && sections.length - Number(removeSource) >= 8) {
    throw new Error('最多 8 张卡片或合集，请先腾出位置');
  }
  if (
    !target &&
    sections.some(function (s) {
      return s.id === newId;
    })
  ) {
    throw new Error('新卡片编号重复，请重试');
  }
  var item = source.items[itemIndex];
  var next = sections
    .filter(function (s) {
      return !(removeSource && s.id === sourceId);
    })
    .map(function (s) {
      if (s.id === sourceId) {
        return Object.assign({}, s, {
          items: s.items.filter(function (_, idx) {
            return idx !== itemIndex;
          }),
        });
      }
      if (target && s.id === target.id) {
        return Object.assign({}, s, {
          collection_layout: s.collection_layout || 'list',
          items: s.items.concat([item]),
        });
      }
      return s;
    });
  if (!target) {
    next.splice(Math.min(sourceIdx + 1, next.length), 0, {
      id: newId,
      type: 'links',
      title: '',
      visible: source.visible !== false,
      items: [item],
    });
  }
  return next;
}

module.exports = {
  COLLECTION_LAYOUTS: COLLECTION_LAYOUTS,
  isLinkCollection: isLinkCollection,
  collectionMemberCount: collectionMemberCount,
  titleOfItem: titleOfItem,
  providerFor: providerFor,
  removeFromCollection: removeFromCollection,
  moveCollectionLink: moveCollectionLink,
};
