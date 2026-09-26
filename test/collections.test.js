const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const collections = require('../miniprogram/services/collections');

describe('collections parity with App', () => {
  it('isLinkCollection matches App rules', () => {
    assert.equal(
      collections.isLinkCollection({
        type: 'links',
        title: '',
        items: [{ url: 'https://a.com' }],
      }),
      false
    );
    assert.equal(
      collections.isLinkCollection({
        type: 'links',
        title: '合集',
        collection_layout: 'list',
        items: [],
      }),
      true
    );
    assert.equal(
      collections.isLinkCollection({
        type: 'links',
        collection_id: 'parent',
        items: [{ url: 'https://a.com' }],
      }),
      false
    );
  });

  it('providerFor detects social hosts', () => {
    assert.equal(
      collections.providerFor({ url: 'https://www.instagram.com/foo/' }),
      'instagram'
    );
    assert.equal(
      collections.providerFor({ url: 'https://tiktok.com/@x' }),
      'tiktok'
    );
    assert.equal(
      collections.providerFor({ social_provider: 'youtube', url: '' }),
      'youtube'
    );
    assert.equal(collections.providerFor({ url: 'https://example.com' }), '');
  });

  it('removeFromCollection extracts item to standalone section', () => {
    const sections = [
      {
        id: 'col1',
        type: 'links',
        title: '合集',
        collection_layout: 'showcase',
        visible: true,
        items: [
          { label: 'A', url: 'https://a.example/1' },
          { label: 'B', url: 'https://a.example/2' },
        ],
      },
    ];
    const next = collections.removeFromCollection(sections, 'col1', 0, 'sec_new');
    assert.equal(next.length, 2);
    assert.equal(next[0].items.length, 1);
    assert.equal(next[0].items[0].label, 'B');
    assert.equal(next[1].id, 'sec_new');
    assert.equal(next[1].items[0].label, 'A');
    assert.equal(next[1].title, '');
  });

  it('moveCollectionLink nests video item into a collection', () => {
    const sections = [
      {
        id: 'col1',
        type: 'links',
        title: '合集',
        collection_layout: 'list',
        visible: true,
        items: [{ label: 'A', url: 'https://a.example/1' }],
      },
      {
        id: 'vid1',
        type: 'video',
        title: '爆款影像 · 视频',
        visible: true,
        items: [
          { title: '样片', url: 'https://www.youtube.com/watch?v=1' },
          { title: 'Demo', url: 'https://www.youtube.com/watch?v=2' },
        ],
      },
    ];
    const next = collections.moveCollectionLink(
      sections,
      'vid1',
      0,
      'col1',
      'sec_nested'
    );
    assert.equal(next.find((s) => s.id === 'vid1').items.length, 1);
    const nested = next.find((s) => s.id === 'sec_nested');
    assert.ok(nested);
    assert.equal(nested.collection_id, 'col1');
    assert.equal(nested.type, 'video');
    assert.equal(nested.items[0].title, '样片');
  });
});
