/**
 * 主页所见即所得预览模型 · 对齐公开页 SSR cover / sections / metadata
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const homePreview = require('../miniprogram/services/homePreview');

describe('homePreview viewModel', () => {
  const draft = {
    display_name: 'YangJX · AI 造物主',
    headline: '用 Agent 打爆款',
    bio: '完整简介应出现在预览中',
    portrait_url: 'https://images.unsplash.com/photo-1.jpg',
    cover_url: 'https://images.unsplash.com/photo-cover.jpg',
    cover_position: 40,
    show_branding: true,
    profile_metadata: {
      location: '中国 · 远程',
      languages: ['zh', 'en'],
      offers: [
        {
          label: '爆款短视频全案',
          price_minor: 1280000,
          currency: 'CNY',
          lead_time_days: 7,
        },
      ],
      wants: [{ label: '品牌方' }],
    },
    socials: [
      { kind: 'youtube', label: 'YouTube', url: 'https://www.youtube.com/@x' },
      { kind: 'email', label: '邮箱', url: 'a@b.co' },
    ],
    sections: [
      {
        id: 'skills',
        type: 'skills',
        title: '核心能力',
        visible: true,
        items: [{ label: 'AI Agent 编排' }, { label: '爆款短视频' }],
      },
      {
        id: 'video',
        type: 'video',
        title: '爆款影像',
        visible: true,
        items: [
          {
            title: '成片 A',
            url: 'https://www.youtube.com/watch?v=1',
            cover_url: 'https://images.unsplash.com/photo-v1.jpg',
            duration: '4:32',
          },
          {
            title: '成片 B',
            url: 'https://www.youtube.com/watch?v=2',
            cover_url: 'https://images.unsplash.com/photo-v2.jpg',
          },
        ],
      },
      {
        id: 'links',
        type: 'links',
        title: '视觉案例',
        visible: true,
        collection_layout: 'showcase',
        items: [
          {
            label: 'AI 时尚大片',
            url: 'https://images.unsplash.com/photo-a.jpg',
            note: '12 套风格',
            image_url: 'https://images.unsplash.com/photo-a.jpg',
            layout: 'featured',
            color: 'lilac',
          },
        ],
      },
      {
        id: 'agents',
        type: 'agents',
        title: 'Agents',
        visible: true,
        items: [
          {
            name: '选题 Agent',
            desc: '扫热点',
            url: 'https://www.muuzi.co',
          },
        ],
      },
    ],
  };

  it('builds cover slots from cover_url and section media', () => {
    const slots = homePreview.coverSlots(draft);
    assert.equal(slots.length, 3);
    assert.equal(slots[0].url, draft.cover_url);
    assert.equal(slots[0].position, 40);
    assert.ok(slots[1] && slots[1].url);
  });

  it('viewModel keeps bio + headline + metadata + typed sections', () => {
    const model = homePreview.viewModel(draft, { slug: 'demo', draft: true });
    assert.equal(model.name, draft.display_name);
    assert.equal(model.headline, draft.headline);
    assert.equal(model.bio, draft.bio);
    assert.equal(model.draft, true);
    assert.equal(model.meta.location, '中国 · 远程');
    assert.equal(model.meta.languagesText, '中文 · 英语');
    assert.equal(model.meta.offers.length, 1);
    assert.match(model.meta.offers[0].meta, /¥12800|约 7 天/);
    assert.equal(model.meta.wants.length, 1);
    assert.equal(model.socials.length, 2);
    assert.equal(model.sections.length, 4);

    const skills = model.sections.find((s) => s.isSkills);
    assert.ok(skills);
    assert.equal(skills.items.length, 2);

    const video = model.sections.find((s) => s.isVideo);
    assert.ok(video.videoHero);
    assert.equal(video.videoHero.cover_url, 'https://images.unsplash.com/photo-v1.jpg');
    assert.equal(video.videoRest.length, 1);

    const links = model.sections.find((s) => s.id === 'links');
    assert.equal(links.items[0].featured, true);
    assert.equal(links.items[0].image_url, 'https://images.unsplash.com/photo-a.jpg');
    assert.equal(links.isShowcase, true);
    assert.equal(links.isBento, true);
    assert.equal(links.items[0].tintBg, '#e7e2ff');
    assert.equal(links.items[0].isFirst, true);

    const agents = model.sections.find((s) => s.isAgents);
    assert.equal(agents.items[0].name, '选题 Agent');
  });

  it('accepts https cover urls without depending on URL ctor', () => {
    const slots = homePreview.coverSlots({
      cover_url:
        'https://images.unsplash.com/photo-x?auto=format&fit=crop&w=1600&q=80',
      sections: [],
    });
    assert.equal(slots[0].url.indexOf('https://images.unsplash.com/'), 0);
    assert.equal(slots[1], null);
    assert.equal(slots[2], null);
  });
});
