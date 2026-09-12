(function () {
  const storageKey = 'aiTeaCheck.demoStore.v1';
  const classMeta = [
    { code: 'healthy', name: '健康叶片', category: 'health', advice: '继续保持常规巡查，建议保留当前叶片作为健康对照样本。', recheckDays: 7 },
    { code: 'algal_leaf', name: '藻斑病', category: 'disease', advice: '优先改善通风透光并清理重病叶，结合当地农技规程进行复核和防控。', recheckDays: 3 },
    { code: 'anthracnose', name: '茶炭疽病', category: 'disease', advice: '记录发生地块和扩散范围，清理重病叶并提交农技员确认，避免未经审核直接用药。', recheckDays: 3 },
    { code: 'bird_eye_spot', name: '鸟眼斑', category: 'disease', advice: '建议补拍叶片正反面并检查相邻植株，确认是否为局部斑点或成片发生。', recheckDays: 3 },
    { code: 'brown_blight', name: '褐斑病', category: 'disease', advice: '加强排水、通风和田间卫生，标记病株并由农技人员确定后续措施。', recheckDays: 3 },
    { code: 'gray_blight', name: '灰斑病', category: 'disease', advice: '检查叶片边缘与枝梢症状，建议上传多角度照片并安排专家复核。', recheckDays: 3 },
    { code: 'red_leaf_spot', name: '红叶斑', category: 'disease', advice: '记录红斑面积比例和发生范围，排查营养、日灼及病害等混淆因素。', recheckDays: 3 },
    { code: 'white_spot', name: '白斑病', category: 'disease', advice: '检查叶背和相邻叶片，保持茶园通风，并由专家排除虫害或机械损伤。', recheckDays: 3 },
    { code: 'tea_white_scab', name: '茶白星病/白痂症状', category: 'disease', advice: '补拍叶片正反面和枝梢，结合湿度、郁闭度和历史发病区进行专家复核。', recheckDays: 3 },
    { code: 'tea_blister_blight', name: '茶饼病', category: 'disease', advice: '关注低温高湿和嫩叶发病，先隔离高风险地块并安排农技员确认绿色防控方案。', recheckDays: 2 },
    { code: 'tea_blister_blight_perforation', name: '茶饼病穿孔期', category: 'disease', advice: '记录穿孔比例和扩散范围，清理严重病叶，结合茶园湿度管理进行复查。', recheckDays: 2 },
    { code: 'leaf_beetle', name: '叶甲类虫害', category: 'pest', advice: '重点检查叶缘取食痕、虫口密度和发生中心，优先采用灯诱、人工清除和生物防控。', recheckDays: 2 },
    { code: 'apolygus_lucorum', name: '绿盲蝽类虫害', category: 'pest', advice: '重点排查嫩梢和幼叶刺吸症状，记录虫口密度并提交农技员制定绿色防控方案。', recheckDays: 2 },
    { code: 'unknown', name: '疑似未知症状', category: 'unknown', advice: '系统无法可靠归类，请补拍叶片正反面、整株和周边环境照片并提交专家复核。', recheckDays: 1 }
  ];
  const supportedClasses = classMeta.map((item) => item.code);
  const fileHints = {
    healthy: ['healthy', 'normal', '健康'],
    algal_leaf: ['algal', '藻斑'],
    anthracnose: ['anthracnose', '炭疽'],
    bird_eye_spot: ['bird_eye', 'bird-eye', '鸟眼'],
    brown_blight: ['brown_blight', 'brown-blight', '褐斑'],
    gray_blight: ['gray_blight', 'gray-light', '灰斑'],
    red_leaf_spot: ['red_leaf', 'red-leaf', '红叶'],
    white_spot: ['white_spot', 'white-spot', '白斑'],
    tea_white_scab: ['whitescab', 'white_scab', '白星', '白痂'],
    tea_blister_blight: ['teablisterblight', 'blister_blight', '茶饼'],
    tea_blister_blight_perforation: ['teablisterblightafter', 'perforation', '穿孔'],
    leaf_beetle: ['leafbeetle', 'leaf_beetle', '叶甲'],
    apolygus_lucorum: ['mirid', 'apolygus', '绿盲蝽']
  };

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function now() {
    return new Date().toISOString();
  }

  function createId(prefix) {
    return prefix + '-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
  }

  function knowledgeFor(database, code) {
    return database.knowledge.find((item) => item.code === code) || database.knowledge.find((item) => item.code === 'unknown');
  }

  function defaultDatabase() {
    const base = {
      meta: { schemaVersion: 2, createdAt: now(), updatedAt: now() },
      model: {
        version: 'tea-disease-pest-mobilenetv3-2026-08-14',
        mode: 'demo-browser',
        supportedClasses,
        modelFile: 'models/tea_disease_pest.onnx',
        metricsFile: 'models/metrics.json',
        notice: '浏览器静态演示模式可离线运行；本地后端可用时将自动切换到真实服务。'
      },
      fields: [
        { id: 'field-a01', garden: '信阳示范茶园', name: 'A-01 向阳坡', areaMu: 38, variety: '信阳群体种', owner: '示范合作社', risk: 'medium', lat: 32.125, lng: 114.067, lastPatrolAt: now() },
        { id: 'field-a02', garden: '信阳示范茶园', name: 'A-02 林缘地', areaMu: 26, variety: '信阳10号', owner: '示范合作社', risk: 'low', lat: 32.127, lng: 114.071, lastPatrolAt: now() },
        { id: 'field-b01', garden: '青年实训茶园', name: 'B-01 试验地', areaMu: 12, variety: '信阳群体种', owner: '项目团队', risk: 'high', lat: 32.131, lng: 114.074, lastPatrolAt: now() }
      ],
      records: [],
      tasks: [],
      knowledge: classMeta
    };
    base.records = [
      {
        id: 'rec-demo-healthy',
        fieldId: base.fields[0].id,
        source: 'demo',
        reporter: '项目演示员',
        note: '健康叶片样本',
        createdAt: now(),
        imageFile: '',
        originalName: 'healthy-demo.jpg',
        status: 'healthy',
        result: {
          engine: 'demo-browser',
          modelReady: false,
          classCode: 'healthy',
          category: 'health',
          confidence: 0.96,
          topK: [{ classCode: 'healthy', confidence: 0.96 }],
          lesionRatio: 0,
          severity: 'healthy',
          lesionBox: null,
          needsReview: false,
          quality: { score: 93, accepted: true, issues: [], brightness: 128, sharpness: 210, width: 1024, height: 768 },
          explanation: '示范样本：健康叶片。',
          disclaimer: '浏览器静态演示结果，仅用于展示界面和流程。'
        },
        advice: classMeta[0].advice,
        expertReview: null,
        treatment: null,
        recheck: null,
        imageDataUrl: ''
      },
      {
        id: 'rec-demo-disease',
        fieldId: base.fields[1].id,
        source: 'demo',
        reporter: '项目演示员',
        note: '示范病斑样本',
        createdAt: now(),
        imageFile: '',
        originalName: 'anthracnose-demo.jpg',
        status: 'expert_review',
        result: {
          engine: 'demo-browser',
          modelReady: false,
          classCode: 'anthracnose',
          category: 'disease',
          confidence: 0.74,
          topK: [{ classCode: 'anthracnose', confidence: 0.74 }],
          lesionRatio: 0.091,
          severity: 'medium',
          lesionBox: { x: 24, y: 21, width: 37, height: 28 },
          needsReview: true,
          quality: { score: 82, accepted: true, issues: [], brightness: 116, sharpness: 182, width: 1024, height: 768 },
          explanation: '示范样本：病害复核流程。',
          disclaimer: '浏览器静态演示结果，仅用于展示界面和流程。'
        },
        advice: classMeta[2].advice,
        expertReview: null,
        treatment: null,
        recheck: null,
        imageDataUrl: ''
      },
      {
        id: 'rec-demo-pest',
        fieldId: base.fields[2].id,
        source: 'demo',
        reporter: '项目演示员',
        note: '示范虫害样本',
        createdAt: now(),
        imageFile: '',
        originalName: 'leafbeetle-demo.jpg',
        status: 'treated',
        result: {
          engine: 'demo-browser',
          modelReady: false,
          classCode: 'leaf_beetle',
          category: 'pest',
          confidence: 0.81,
          topK: [{ classCode: 'leaf_beetle', confidence: 0.81 }],
          lesionRatio: 0.058,
          severity: 'medium',
          lesionBox: { x: 19, y: 18, width: 31, height: 26 },
          needsReview: false,
          quality: { score: 88, accepted: true, issues: [], brightness: 121, sharpness: 190, width: 1024, height: 768 },
          explanation: '示范样本：虫害处置流程。',
          disclaimer: '浏览器静态演示结果，仅用于展示界面和流程。'
        },
        advice: classMeta[11].advice,
        expertReview: { expert: '示范农技专家', comment: '示范复核已完成', reviewedAt: now() },
        treatment: { measure: '示范处置：清理病叶并进行绿色防控', operator: '项目演示员', treatedAt: now(), dueAt: now() },
        recheck: null,
        imageDataUrl: ''
      }
    ];
    base.tasks = [
      { id: 'task-demo-1', recordId: 'rec-demo-pest', fieldId: base.fields[2].id, title: '复查：叶甲类虫害', dueAt: now(), status: 'pending', assignee: '项目演示员', createdAt: now() }
    ];
    return base;
  }

  let databaseCache = null;

  function indexedDatabaseRead() {
    if (!window.indexedDB) return Promise.resolve(null);
    return new Promise((resolve) => {
      const request = indexedDB.open('aiTeaCheck', 1);
      request.onupgradeneeded = () => request.result.createObjectStore('state');
      request.onerror = () => resolve(null);
      request.onsuccess = () => {
        const transaction = request.result.transaction('state', 'readonly');
        const read = transaction.objectStore('state').get('database');
        read.onerror = () => resolve(null);
        read.onsuccess = () => resolve(read.result || null);
      };
    });
  }

  function indexedDatabaseWrite(database) {
    if (!window.indexedDB) return Promise.resolve();
    return new Promise((resolve) => {
      const request = indexedDB.open('aiTeaCheck', 1);
      request.onupgradeneeded = () => request.result.createObjectStore('state');
      request.onerror = () => resolve();
      request.onsuccess = () => {
        const transaction = request.result.transaction('state', 'readwrite');
        transaction.objectStore('state').put(database, 'database');
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => resolve();
      };
    });
  }

  async function hydrateDatabase() {
    const indexed = await indexedDatabaseRead();
    let parsed = indexed;
    if (!parsed) {
      try {
        const stored = localStorage.getItem(storageKey);
        parsed = stored ? JSON.parse(stored) : null;
      } catch {}
    }
    databaseCache = parsed ? Object.assign(defaultDatabase(), parsed) : defaultDatabase();
    if (!parsed) await indexedDatabaseWrite(databaseCache);
    return databaseCache;
  }

  const databaseReady = hydrateDatabase();

  function loadDatabase() {
    if (databaseCache) return databaseCache;
    try {
      const stored = localStorage.getItem(storageKey);
      if (!stored) {
        const initial = defaultDatabase();
        databaseCache = initial;
        localStorage.setItem(storageKey, JSON.stringify(initial));
        return initial;
      }
      databaseCache = Object.assign(defaultDatabase(), JSON.parse(stored));
      return databaseCache;
    } catch {
      const initial = defaultDatabase();
      databaseCache = initial;
      try { localStorage.setItem(storageKey, JSON.stringify(initial)); } catch {}
      return initial;
    }
  }

  function saveDatabase(database) {
    database.meta ||= { schemaVersion: 2, createdAt: now(), updatedAt: now() };
    database.meta.updatedAt = now();
    databaseCache = database;
    try { localStorage.setItem(storageKey, JSON.stringify(database)); } catch {}
    indexedDatabaseWrite(database);
    return database;
  }

  function withDatabase(mutator) {
    const database = loadDatabase();
    const result = mutator(database);
    saveDatabase(database);
    return result;
  }

  function displayRecord(record, database) {
    const field = database.fields.find((item) => item.id === record.fieldId);
    const knowledge = knowledgeFor(database, record.result.classCode);
    return {
      ...clone(record),
      imageUrl: record.imageDataUrl || '',
      field,
      diseaseName: knowledge?.name || record.result.classCode,
      advice: record.advice || knowledge?.advice || ''
    };
  }

  function dashboard(database) {
    const records = database.records;
    const unresolved = records.filter((item) => !['closed', 'healthy'].includes(item.status)).length;
    const reviews = records.filter((item) => item.status === 'expert_review').length;
    const highRisk = records.filter((item) => item.result.severity === 'high').length;
    const completedTasks = database.tasks.filter((item) => item.status === 'completed').length;
    const classCounts = {};
    for (const record of records) classCounts[record.result.classCode] = (classCounts[record.result.classCode] || 0) + 1;
    return {
      fields: database.fields.length,
      records: records.length,
      unresolved,
      reviews,
      highRisk,
      tasks: database.tasks.length,
      completedTasks,
      completionRate: database.tasks.length ? Math.round(completedTasks / database.tasks.length * 100) : 0,
      classCounts,
      model: database.model,
      latestRecords: records.slice(0, 8).map((record) => displayRecord(record, database))
    };
  }

  function normalizeClassCode(code) {
    return supportedClasses.includes(code) ? code : 'unknown';
  }

  function detectHint(fileName) {
    const lower = fileName.toLowerCase();
    for (const [code, hints] of Object.entries(fileHints)) {
      if (hints.some((hint) => lower.includes(hint.toLowerCase()))) return code;
    }
    return null;
  }

  function severityFromRatio(ratio, category) {
    if (category === 'health') return 'healthy';
    if (category === 'pest') {
      if (ratio < 0.055) return 'low';
      if (ratio < 0.12) return 'medium';
      return 'high';
    }
    if (ratio < 0.05) return 'low';
    if (ratio < 0.15) return 'medium';
    return 'high';
  }

  async function digestBytes(bytes) {
    const hash = await crypto.subtle.digest('SHA-256', bytes);
    return new Uint8Array(hash);
  }

  async function loadImageMetrics(file) {
    const url = URL.createObjectURL(file);
    try {
      const image = await new Promise((resolve, reject) => {
        const element = new Image();
        element.onload = () => resolve(element);
        element.onerror = reject;
        element.src = url;
      });
      const width = image.naturalWidth || image.width || 0;
      const height = image.naturalHeight || image.height || 0;
      const canvas = document.createElement('canvas');
      const targetWidth = 192;
      const targetHeight = 192;
      canvas.width = targetWidth;
      canvas.height = targetHeight;
      const context = canvas.getContext('2d', { willReadFrequently: true });
      context.drawImage(image, 0, 0, targetWidth, targetHeight);
      const data = context.getImageData(0, 0, targetWidth, targetHeight).data;
      let sumRed = 0;
      let sumGreen = 0;
      let sumBlue = 0;
      for (let index = 0; index < data.length; index += 4) {
        sumRed += data[index];
        sumGreen += data[index + 1];
        sumBlue += data[index + 2];
      }
      const pixels = data.length / 4;
      const brightness = (sumRed + sumGreen + sumBlue) / (3 * pixels);
      const gray = new Float32Array(pixels);
      for (let index = 0, pixel = 0; index < data.length; index += 4, pixel += 1) {
        gray[pixel] = data[index] * 0.299 + data[index + 1] * 0.587 + data[index + 2] * 0.114;
      }
      let sharpness = 0;
      for (let row = 1; row < targetHeight - 1; row += 2) {
        for (let column = 1; column < targetWidth - 1; column += 2) {
          const center = row * targetWidth + column;
          const laplacian = -4 * gray[center] + gray[center - 1] + gray[center + 1] + gray[center - targetWidth] + gray[center + targetWidth];
          sharpness += laplacian * laplacian;
        }
      }
      sharpness = sharpness / ((targetWidth / 2) * (targetHeight / 2));
      const greenDominance = sumGreen / Math.max(1, (sumRed + sumBlue) / 2);
      const issues = [];
      if (width < 320 || height < 240) issues.push('图片分辨率偏低');
      if (brightness < 38) issues.push('画面过暗');
      if (brightness > 232) issues.push('画面过曝');
      if (sharpness < 65) issues.push('画面可能模糊');
      return {
        score: Math.round(Math.max(20, Math.min(99, 100 - issues.length * 22 + Math.min(12, sharpness / 35)))),
        accepted: issues.length < 3,
        issues,
        brightness: Number(brightness.toFixed(1)),
        sharpness: Number(sharpness.toFixed(1)),
        width,
        height,
        greenDominance,
        entropy: 0
      };
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  async function readDataUrl(file, maxWidth = 960) {
    const url = URL.createObjectURL(file);
    try {
      const image = await new Promise((resolve, reject) => {
        const element = new Image();
        element.onload = () => resolve(element);
        element.onerror = reject;
        element.src = url;
      });
      const scale = Math.min(1, maxWidth / (image.naturalWidth || image.width || maxWidth));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round((image.naturalWidth || image.width || maxWidth) * scale));
      canvas.height = Math.max(1, Math.round((image.naturalHeight || image.height || maxWidth) * scale));
      const context = canvas.getContext('2d');
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      return canvas.toDataURL('image/jpeg', 0.88);
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  async function demoPrediction(file, originalName, quality) {
    const classCode = 'unknown';
    const confidence = 0.42;
    const category = 'unknown';
    const needsReview = true;
    return {
      engine: 'demo-browser',
      modelReady: false,
      classCode,
      category,
      confidence,
      topK: [{ classCode, confidence }],
      lesionRatio: null,
      severity: 'review',
      lesionBox: null,
      needsReview,
      quality,
      explanation: '浏览器静态演示不加载模型，上传图片统一进入专家复核。',
      disclaimer: '当前为浏览器静态演示结果，不依赖后端服务；本地部署时会自动切换到真实 API。'
    };
  }

  async function localRequest(url, options) {
    await databaseReady;
    const method = (options?.method || 'GET').toUpperCase();
    const database = loadDatabase();
    const parsedUrl = new URL(url, window.location.origin);
    const pathname = parsedUrl.pathname;
    const body = options?.body;

    if (method === 'GET' && pathname === '/api/health') {
      return { ok: true, service: 'AI茶查查静态演示', version: '2.1.0', time: now(), model: database.model };
    }
    if (method === 'GET' && pathname === '/api/dashboard') return dashboard(database);
    if (method === 'GET' && pathname === '/api/model') return database.model;
    if (method === 'GET' && pathname === '/api/knowledge') return clone(database.knowledge);
    if (method === 'GET' && pathname === '/api/fields') return clone(database.fields);
    if (method === 'POST' && pathname === '/api/fields') {
      return withDatabase((store) => {
        const field = {
          id: createId('field'),
          garden: body?.garden || '未命名茶园',
          name: body?.name || '未命名地块',
          areaMu: Number(body?.areaMu || 0),
          variety: body?.variety || '待补充',
          owner: body?.owner || '待补充',
          risk: 'low',
          lat: Number(body?.lat || 0),
          lng: Number(body?.lng || 0),
          lastPatrolAt: null
        };
        store.fields.push(field);
        return field;
      });
    }
    if (method === 'GET' && pathname === '/api/records') {
      let records = database.records;
      if (parsedUrl.searchParams.get('fieldId')) records = records.filter((item) => item.fieldId === parsedUrl.searchParams.get('fieldId'));
      if (parsedUrl.searchParams.get('status')) records = records.filter((item) => item.status === parsedUrl.searchParams.get('status'));
      return records.map((record) => displayRecord(record, database));
    }
    if (method === 'GET' && pathname.startsWith('/api/records/')) {
      const id = pathname.split('/')[3];
      const record = database.records.find((item) => item.id === id);
      if (!record) throw new Error('记录不存在');
      return displayRecord(record, database);
    }
    if (method === 'POST' && pathname === '/api/predict') {
      const form = body instanceof FormData ? body : null;
      const file = form?.get('image');
      if (!(file instanceof File || file instanceof Blob)) throw new Error('请上传图片');
      return Promise.resolve(file).then(async (imageFile) => {
        const reporter = form?.get('reporter') || '体验用户';
        const source = form?.get('source') || 'web';
        const note = form?.get('note') || '';
        const fieldId = form?.get('fieldId') || '';
        const quality = await loadImageMetrics(imageFile);
        const analysis = await demoPrediction(imageFile, imageFile.name || 'upload.jpg', quality);
        const dataUrl = await readDataUrl(imageFile);
        return withDatabase((store) => {
          const knowledge = knowledgeFor(store, analysis.classCode);
          const field = store.fields.find((item) => item.id === fieldId) || store.fields[0];
          field.lastPatrolAt = now();
          if (analysis.severity === 'high') field.risk = 'high';
          else if (analysis.severity === 'medium' && field.risk !== 'high') field.risk = 'medium';
          const item = {
            id: createId('rec'),
            fieldId: field.id,
            source,
            reporter,
            note,
            createdAt: now(),
            imageFile: '',
            originalName: imageFile.name || 'upload.jpg',
            status: analysis.classCode === 'healthy' ? 'healthy' : analysis.classCode === 'unknown' || analysis.confidence < 0.72 ? 'expert_review' : 'diagnosed',
            result: analysis,
            advice: knowledge?.advice || '',
            expertReview: null,
            treatment: null,
            recheck: null,
            imageDataUrl: dataUrl
          };
          store.records.unshift(item);
          return displayRecord(item, store);
        });
      });
    }
    if (method === 'POST' && pathname.match(/^\/api\/records\/[^/]+\/review$/)) {
      const id = pathname.split('/')[3];
      return withDatabase((store) => {
        const record = store.records.find((item) => item.id === id);
        if (!record) throw new Error('记录不存在');
        const classCode = body?.classCode || record.result.classCode;
        record.result.classCode = classCode;
        record.result.severity = body?.severity || record.result.severity;
        record.expertReview = { expert: body?.expert || '示范农技专家', comment: body?.comment || '已复核', reviewedAt: now() };
        record.advice = knowledgeFor(store, classCode)?.advice || record.advice;
        record.status = 'reviewed';
        return displayRecord(record, store);
      });
    }
    if (method === 'POST' && pathname.match(/^\/api\/records\/[^/]+\/treatment$/)) {
      const id = pathname.split('/')[3];
      return withDatabase((store) => {
        const record = store.records.find((item) => item.id === id);
        if (!record) throw new Error('记录不存在');
        const knowledge = knowledgeFor(store, record.result.classCode);
        const days = Number(body?.recheckDays || knowledge?.recheckDays || 3);
        const dueAt = new Date(Date.now() + days * 86400000).toISOString();
        const treatment = { measure: body?.measure || '清理病叶、改善通风并等待专家指导', operator: body?.operator || '巡园员', treatedAt: now(), dueAt };
        record.treatment = treatment;
        record.status = 'treated';
        const task = { id: createId('task'), recordId: record.id, fieldId: record.fieldId, title: '复查：' + (knowledge?.name || record.result.classCode), dueAt, status: 'pending', assignee: body?.operator || '巡园员', createdAt: now() };
        store.tasks.unshift(task);
        return { record: displayRecord(record, store), task };
      });
    }
    if (method === 'POST' && pathname.match(/^\/api\/records\/[^/]+\/recheck$/)) {
      const id = pathname.split('/')[3];
      return withDatabase((store) => {
        const record = store.records.find((item) => item.id === id);
        if (!record) throw new Error('记录不存在');
        record.recheck = { outcome: body?.outcome || 'improved', note: body?.note || '', checkedAt: now(), operator: body?.operator || '巡园员' };
        record.status = body?.outcome === 'worse' ? 'expert_review' : 'closed';
        for (const task of store.tasks.filter((item) => item.recordId === record.id && item.status !== 'completed')) {
          task.status = 'completed';
          task.completedAt = now();
        }
        return displayRecord(record, store);
      });
    }
    if (method === 'GET' && pathname === '/api/tasks') {
      return database.tasks.map((task) => ({ ...clone(task), field: database.fields.find((item) => item.id === task.fieldId) }));
    }
    if (method === 'POST' && pathname.match(/^\/api\/tasks\/[^/]+\/complete$/)) {
      const id = pathname.split('/')[3];
      return withDatabase((store) => {
        const item = store.tasks.find((candidate) => candidate.id === id);
        if (!item) throw new Error('任务不存在');
        item.status = 'completed';
        item.completedAt = now();
        item.note = body?.note || '';
        return item;
      });
    }
    if (method === 'GET' && pathname === '/api/report/summary') {
      return { generatedAt: now(), dashboard: dashboard(database), fields: database.fields, records: database.records.map((record) => displayRecord(record, database)), tasks: database.tasks };
    }
    throw new Error('静态演示模式暂不支持该请求：' + pathname);
  }

  async function request(url, options) {
    try {
      const response = await fetch(url, options);
      const text = await response.text();
      let data;
      try { data = text ? JSON.parse(text) : {}; } catch { data = text; }
      if (!response.ok) throw new Error((data && data.error) || '请求失败');
      return data;
    } catch (error) {
      if (window.location.protocol === 'http:' || window.location.protocol === 'https:') {
        return await localRequest(url, options);
      }
      throw error;
    }
  }

  window.teaDemoApi = { request };
})();
