const app = getApp();

function baseUrl() {
  return (app.globalData && app.globalData.baseUrl || '').replace(/\/$/, '');
}

function absoluteUrl(value) {
  if (!value || /^https?:\/\//i.test(value) || /^wxfile:\/\//i.test(value)) return value;
  return baseUrl() + (value.charAt(0) === '/' ? value : '/' + value);
}

function normalize(value) {
  if (Array.isArray(value)) return value.map(normalize);
  if (!value || typeof value !== 'object') return value;

  const result = {};
  Object.keys(value).forEach((key) => {
    result[key] = key === 'imageUrl' ? absoluteUrl(value[key]) : normalize(value[key]);
  });
  return result;
}

function request(path, method = 'GET', data = {}) {
  return new Promise((resolve, reject) => {
    wx.request({
      url: /^https?:\/\//i.test(path) ? path : baseUrl() + path,
      method,
      data,
      header: { 'content-type': 'application/json' },
      success: (response) => {
        if (response.statusCode >= 200 && response.statusCode < 300) {
          resolve(normalize(response.data));
        } else {
          reject(new Error(response.data && response.data.error || '请求失败'));
        }
      },
      fail: (error) => reject(new Error('无法连接电脑服务，请确认手机与电脑在同一 Wi-Fi，并检查小程序 app.js 中的 baseUrl。'))
    });
  });
}

function upload(path, filePath, formData = {}) {
  return new Promise((resolve, reject) => {
    wx.uploadFile({
      url: baseUrl() + path,
      filePath,
      name: 'image',
      formData,
      success: (response) => {
        try {
          const data = JSON.parse(response.data);
          if (response.statusCode >= 200 && response.statusCode < 300) {
            resolve(normalize(data));
          } else {
            reject(new Error(data.error || '上传失败'));
          }
        } catch (error) {
          reject(error);
        }
      },
      fail: (error) => reject(new Error('无法连接电脑服务，请确认手机与电脑在同一 Wi-Fi，并检查小程序 app.js 中的 baseUrl。'))
    });
  });
}

module.exports = { request, upload, absoluteUrl };
