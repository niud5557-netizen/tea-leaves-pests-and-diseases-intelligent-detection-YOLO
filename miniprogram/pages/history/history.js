const api = require('../../utils/api');

Page({
  data: { records: [], title: '巡查历史', reviewOnly: false },

  onLoad(options) {
    const reviewOnly = options.status === 'expert_review';
    this.setData({ reviewOnly, title: reviewOnly ? '待复核' : '巡查历史' });
    wx.setNavigationBarTitle({ title: reviewOnly ? '待复核' : '历史记录' });
  },

  onShow() { this.load(); },

  async load() {
    try {
      const records = await api.request('/api/records');
      const filtered = this.data.reviewOnly
        ? records.filter((record) => record.status === 'expert_review' || record.result && record.result.needsReview)
        : records;
      this.setData({ records: filtered });
    } catch (error) {
      wx.showToast({ title: '记录加载失败', icon: 'none' });
    }
  }
});
