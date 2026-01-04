import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';
import * as zlib from 'zlib';
import { createInterface } from 'readline';
import { execSync } from 'child_process';

const DATA_DIR = path.join(process.cwd(), 'public', 'data');
const CEDICT_URL = 'https://www.mdbg.net/chinese/export/cedict/cedict_1_0_ts_utf-8_mdbg.txt.gz';
const UNIHAN_ZIP_URL = 'https://www.unicode.org/Public/UCD/latest/ucd/Unihan.zip';

interface DictEntry {
  t: string;
  s: string;
  p: string;
  d: string[];
}

interface CharData {
  r: string;
  sc: number;
  c?: string[];
}

function downloadFile(url: string, dest: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    https.get(url, (response) => {
      if (response.statusCode === 302 || response.statusCode === 301) {
        const redirectUrl = response.headers.location;
        if (redirectUrl) {
          file.close();
          fs.unlinkSync(dest);
          downloadFile(redirectUrl, dest).then(resolve).catch(reject);
          return;
        }
      }
      response.pipe(file);
      file.on('finish', () => {
        file.close();
        resolve();
      });
    }).on('error', (err) => {
      fs.unlinkSync(dest);
      reject(err);
    });
  });
}

function parseCedictLine(line: string): DictEntry | null {
  if (line.startsWith('#') || line.trim() === '') return null;

  const match = line.match(/^(\S+)\s+(\S+)\s+\[([^\]]+)\]\s+\/(.+)\/$/);
  if (!match) return null;

  const [, traditional, simplified, pinyin, definitions] = match;
  const defList = definitions.split('/').filter(d => d.trim() !== '');

  return {
    t: traditional,
    s: simplified,
    p: pinyin,
    d: defList,
  };
}

async function buildCedict(): Promise<void> {
  console.log('Building CC-CEDICT index...');

  const gzPath = path.join(DATA_DIR, 'cedict.txt.gz');
  const txtPath = path.join(DATA_DIR, 'cedict.txt');
  const outputPath = path.join(DATA_DIR, 'cedict.json');

  if (fs.existsSync(outputPath)) {
    const stats = fs.statSync(outputPath);
    if (stats.size > 1000000) {
      console.log('CC-CEDICT index already exists, skipping...');
      const data = JSON.parse(fs.readFileSync(outputPath, 'utf-8'));
      console.log(`CC-CEDICT index built: ${Object.keys(data).length} entries`);
      return;
    }
  }

  console.log('Downloading CC-CEDICT...');
  await downloadFile(CEDICT_URL, gzPath);

  console.log('Extracting...');
  const gzData = fs.readFileSync(gzPath);
  const txtData = zlib.gunzipSync(gzData);
  fs.writeFileSync(txtPath, txtData);
  fs.unlinkSync(gzPath);

  const entries: Record<string, DictEntry[]> = {};

  const fileStream = fs.createReadStream(txtPath);
  const rl = createInterface({ input: fileStream, crlfDelay: Infinity });

  for await (const line of rl) {
    const entry = parseCedictLine(line);
    if (entry) {
      if (!entries[entry.s]) entries[entry.s] = [];
      entries[entry.s].push(entry);

      if (entry.t !== entry.s) {
        if (!entries[entry.t]) entries[entry.t] = [];
        entries[entry.t].push(entry);
      }
    }
  }

  fs.writeFileSync(outputPath, JSON.stringify(entries));
  console.log(`CC-CEDICT index built: ${Object.keys(entries).length} entries`);

  if (fs.existsSync(txtPath)) {
    fs.unlinkSync(txtPath);
  }
}

// Kangxi radical to Unicode radical mapping (radical number -> character)
const KANGXI_RADICALS: Record<number, string> = {
  1: '一', 2: '丨', 3: '丶', 4: '丿', 5: '乙', 6: '亅', 7: '二', 8: '亠', 9: '人', 10: '儿',
  11: '入', 12: '八', 13: '冂', 14: '冖', 15: '冫', 16: '几', 17: '凵', 18: '刀', 19: '力', 20: '勹',
  21: '匕', 22: '匚', 23: '匸', 24: '十', 25: '卜', 26: '卩', 27: '厂', 28: '厶', 29: '又', 30: '口',
  31: '囗', 32: '土', 33: '士', 34: '夂', 35: '夊', 36: '夕', 37: '大', 38: '女', 39: '子', 40: '宀',
  41: '寸', 42: '小', 43: '尢', 44: '尸', 45: '屮', 46: '山', 47: '巛', 48: '工', 49: '己', 50: '巾',
  51: '干', 52: '幺', 53: '广', 54: '廴', 55: '廾', 56: '弋', 57: '弓', 58: '彐', 59: '彡', 60: '彳',
  61: '心', 62: '戈', 63: '戶', 64: '手', 65: '支', 66: '攴', 67: '文', 68: '斗', 69: '斤', 70: '方',
  71: '无', 72: '日', 73: '曰', 74: '月', 75: '木', 76: '欠', 77: '止', 78: '歹', 79: '殳', 80: '毋',
  81: '比', 82: '毛', 83: '氏', 84: '气', 85: '水', 86: '火', 87: '爪', 88: '父', 89: '爻', 90: '爿',
  91: '片', 92: '牙', 93: '牛', 94: '犬', 95: '玄', 96: '玉', 97: '瓜', 98: '瓦', 99: '甘', 100: '生',
  101: '用', 102: '田', 103: '疋', 104: '疒', 105: '癶', 106: '白', 107: '皮', 108: '皿', 109: '目', 110: '矛',
  111: '矢', 112: '石', 113: '示', 114: '禸', 115: '禾', 116: '穴', 117: '立', 118: '竹', 119: '米', 120: '糸',
  121: '缶', 122: '网', 123: '羊', 124: '羽', 125: '老', 126: '而', 127: '耒', 128: '耳', 129: '聿', 130: '肉',
  131: '臣', 132: '自', 133: '至', 134: '臼', 135: '舌', 136: '舛', 137: '舟', 138: '艮', 139: '色', 140: '艸',
  141: '虍', 142: '虫', 143: '血', 144: '行', 145: '衣', 146: '襾', 147: '見', 148: '角', 149: '言', 150: '谷',
  151: '豆', 152: '豕', 153: '豸', 154: '貝', 155: '赤', 156: '走', 157: '足', 158: '身', 159: '車', 160: '辛',
  161: '辰', 162: '辵', 163: '邑', 164: '酉', 165: '釆', 166: '里', 167: '金', 168: '長', 169: '門', 170: '阜',
  171: '隶', 172: '隹', 173: '雨', 174: '青', 175: '非', 176: '面', 177: '革', 178: '韋', 179: '韭', 180: '音',
  181: '頁', 182: '風', 183: '飛', 184: '食', 185: '首', 186: '香', 187: '馬', 188: '骨', 189: '高', 190: '髟',
  191: '鬥', 192: '鬯', 193: '鬲', 194: '鬼', 195: '魚', 196: '鳥', 197: '鹵', 198: '鹿', 199: '麥', 200: '麻',
  201: '黃', 202: '黍', 203: '黑', 204: '黹', 205: '黽', 206: '鼎', 207: '鼓', 208: '鼠', 209: '鼻', 210: '齊',
  211: '齒', 212: '龍', 213: '龜', 214: '龠',
};

async function buildUnihanData(): Promise<void> {
  console.log('Building Unihan character data...');

  const outputPath = path.join(DATA_DIR, 'unihan.json');
  const zipPath = path.join(DATA_DIR, 'Unihan.zip');
  const extractDir = path.join(DATA_DIR, 'unihan_temp');

  // Download Unihan if needed
  if (!fs.existsSync(path.join(extractDir, 'Unihan_RadicalStrokeCounts.txt'))) {
    console.log('Downloading Unihan database...');
    await downloadFile(UNIHAN_ZIP_URL, zipPath);

    console.log('Extracting Unihan...');
    if (!fs.existsSync(extractDir)) {
      fs.mkdirSync(extractDir, { recursive: true });
    }

    try {
      execSync(`unzip -o "${zipPath}" -d "${extractDir}"`, { stdio: 'pipe' });
    } catch {
      console.log('unzip failed, trying with node...');
      // Fallback: skip Unihan if unzip not available
      console.log('Skipping Unihan data (unzip not available)');
      fs.writeFileSync(outputPath, JSON.stringify({}));
      return;
    }
  }

  const charData: Record<string, CharData> = {};

  // Parse Unihan_RadicalStrokeCounts.txt for radical and stroke info
  const radicalStrokePath = path.join(extractDir, 'Unihan_RadicalStrokeCounts.txt');
  if (fs.existsSync(radicalStrokePath)) {
    const content = fs.readFileSync(radicalStrokePath, 'utf-8');
    const lines = content.split('\n');

    for (const line of lines) {
      if (line.startsWith('#') || line.trim() === '') continue;

      const parts = line.split('\t');
      if (parts.length < 3) continue;

      const [codepoint, field, value] = parts;

      // Parse codepoint like U+4E00
      const match = codepoint.match(/^U\+([0-9A-F]+)$/);
      if (!match) continue;

      const char = String.fromCodePoint(parseInt(match[1], 16));

      if (!charData[char]) {
        charData[char] = { r: '', sc: 0 };
      }

      if (field === 'kRSKangXi' || field === 'kRSUnicode') {
        // Format: radical.additionalStrokes (e.g., "9.4" means radical 9, 4 additional strokes)
        const rsMatch = value.match(/^(\d+)\.(\d+)/);
        if (rsMatch && !charData[char].r) {
          const radicalNum = parseInt(rsMatch[1], 10);
          const additionalStrokes = parseInt(rsMatch[2], 10);
          const radical = KANGXI_RADICALS[radicalNum];
          if (radical) {
            charData[char].r = radical;
            // Total strokes = radical strokes + additional strokes (approximate)
            charData[char].sc = additionalStrokes + 1;
          }
        }
      }

      if (field === 'kTotalStrokes') {
        charData[char].sc = parseInt(value, 10);
      }
    }
  }

  // Cleanup
  if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath);

  fs.writeFileSync(outputPath, JSON.stringify(charData));
  console.log(`Unihan data built: ${Object.keys(charData).length} characters`);
}

async function buildHskData(): Promise<void> {
  console.log('Building HSK word lists...');

  const outputPath = path.join(DATA_DIR, 'hsk.json');

  // HSK 1-6 vocabulary (new HSK 3.0 merged into 6 levels for simplicity)
  // This is a representative sample - full lists would be much larger
  const hskWords: Record<string, number> = {};

  // HSK 1 (most common/basic)
  const hsk1 = [
    '爱', '八', '爸爸', '杯子', '北京', '本', '不', '不客气', '菜', '茶', '吃', '出租车', '打电话', '大', '的', '点', '电脑', '电视', '电影', '东西',
    '都', '读', '对不起', '多', '多少', '儿子', '二', '饭店', '飞机', '分钟', '高兴', '个', '工作', '狗', '汉语', '好', '号', '喝', '和', '很',
    '后面', '回', '会', '几', '家', '叫', '今天', '九', '开', '看', '看见', '块', '来', '老师', '了', '冷', '里', '零', '六', '妈妈',
    '吗', '买', '猫', '没关系', '没有', '米饭', '名字', '明天', '哪', '哪儿', '那', '呢', '能', '你', '年', '女儿', '朋友', '漂亮', '苹果', '七',
    '前面', '钱', '请', '去', '热', '人', '认识', '三', '商店', '上', '上午', '少', '谁', '什么', '十', '时候', '是', '书', '水', '水果',
    '睡觉', '说', '四', '岁', '他', '她', '太', '天气', '听', '同学', '喂', '我', '我们', '五', '喜欢', '下', '下午', '下雨', '先生', '现在',
    '想', '小', '小姐', '些', '写', '谢谢', '星期', '学生', '学习', '学校', '一', '一点儿', '衣服', '医生', '医院', '椅子', '有', '月', '再见', '在',
    '怎么', '怎么样', '这', '中国', '中午', '住', '桌子', '字', '昨天', '坐', '做',
  ];

  // HSK 2
  const hsk2 = [
    '吧', '白', '百', '帮助', '报纸', '比', '别', '宾馆', '长', '唱歌', '出', '穿', '次', '从', '错', '打篮球', '大家', '到', '得', '等',
    '弟弟', '第一', '懂', '对', '房间', '非常', '服务员', '高', '告诉', '哥哥', '给', '公共汽车', '公司', '贵', '过', '还', '孩子', '好吃', '黑', '红',
    '火车站', '机场', '鸡蛋', '件', '教室', '姐姐', '介绍', '进', '近', '就', '觉得', '咖啡', '开始', '考试', '可能', '可以', '课', '快', '快乐', '累',
    '离', '两', '路', '旅游', '卖', '慢', '忙', '每', '妹妹', '门', '面条', '男', '您', '牛奶', '女', '旁边', '跑步', '便宜', '票', '妻子',
    '起床', '千', '铅笔', '晴', '让', '日', '上班', '身体', '生病', '生日', '时间', '事情', '手表', '手机', '说话', '送', '虽然', '它', '踢足球', '题',
    '跳舞', '外', '完', '玩', '晚上', '往', '为什么', '问', '问题', '西瓜', '希望', '洗', '小时', '笑', '新', '姓', '休息', '雪', '颜色', '眼睛',
    '羊肉', '药', '要', '也', '已经', '一起', '一下', '阴', '因为', '游泳', '右边', '鱼', '远', '运动', '再', '早上', '丈夫', '找', '着', '真',
    '正在', '知道', '准备', '自行车', '走', '最', '左边', '作业',
  ];

  // HSK 3
  const hsk3 = [
    '阿姨', '啊', '矮', '爱好', '安静', '把', '班', '搬', '半', '办法', '办公室', '帮忙', '包', '饱', '北方', '被', '鼻子', '比较', '比赛', '必须',
    '变化', '表示', '表演', '别人', '冰箱', '才', '菜单', '参加', '草', '层', '差', '超市', '衬衫', '成绩', '城市', '迟到', '除了', '厨房', '春', '词语',
    '聪明', '打扫', '打算', '带', '担心', '蛋糕', '当然', '地', '地方', '地铁', '地图', '电梯', '电子邮件', '东', '冬', '动物', '短', '段', '锻炼', '多么',
    '饿', '耳朵', '发', '发烧', '发现', '方便', '放', '放心', '分', '附近', '复习', '干净', '感冒', '感兴趣', '刚才', '个子', '根据', '跟', '更', '公园',
    '故事', '刮风', '关', '关系', '关心', '关于', '国家', '果汁', '过去', '还是', '害怕', '寒假', '汉字', '好像', '号码', '河', '黑板', '后来', '护照', '花',
    '花园', '画', '坏', '欢迎', '环境', '换', '黄', '回答', '会议', '或者', '几乎', '极', '记得', '季节', '检查', '简单', '见面', '健康', '讲', '脚',
    '角', '教', '接', '街道', '节目', '节日', '结婚', '结束', '解决', '借', '经常', '经过', '经理', '久', '旧', '句子', '决定', '可爱', '渴', '刻',
    '客人', '空调', '口', '哭', '裤子', '筷子', '蓝', '老', '离开', '礼物', '历史', '脸', '练习', '辆', '了解', '邻居', '留学', '楼', '绿', '马',
    '马上', '满意', '帽子', '米', '面包', '明白', '拿', '奶奶', '南', '难', '难过', '年级', '年轻', '鸟', '努力', '爬山', '盘子', '胖', '皮鞋', '啤酒',
    '其实', '其他', '奇怪', '骑', '起来', '清楚', '请假', '秋', '裙子', '然后', '热情', '认为', '认真', '容易', '如果', '伞', '上网', '生气', '声音', '世界',
    '试', '瘦', '舒服', '叔叔', '树', '数学', '刷牙', '双', '水平', '司机', '太阳', '特别', '疼', '提高', '体育', '甜', '条', '同事', '同意', '头发',
    '突然', '图书馆', '腿', '完成', '碗', '万', '忘记', '为', '为了', '位', '文化', '西', '习惯', '洗手间', '洗澡', '夏', '先', '相信', '香蕉', '向',
    '像', '小心', '校长', '新闻', '新鲜', '信', '信用卡', '行李箱', '兴趣', '熊猫', '需要', '选择', '要求', '爷爷', '一般', '一边', '一定', '一共', '一会儿', '一样',
    '以前', '以为', '音乐', '银行', '应该', '影响', '用', '游戏', '有名', '又', '遇到', '元', '愿意', '越', '月亮', '云', '站', '张', '长', '照顾',
    '照片', '照相机', '着急', '只', '只有', '中间', '中文', '终于', '种', '重要', '周末', '主要', '注意', '自己', '自然', '总是', '嘴', '最近', '作用',
  ];

  // HSK 4
  const hsk4 = [
    '爱情', '安排', '按时', '按照', '百分之', '棒', '包括', '保护', '保证', '报名', '抱', '抱歉', '倍', '本来', '笨', '比如', '毕业', '遍', '标准', '表格',
    '表扬', '饼干', '并且', '博士', '不但', '不得不', '不管', '不过', '不仅', '部分', '擦', '猜', '材料', '参观', '餐厅', '厕所', '差不多', '尝', '场', '长城',
    '长江', '超过', '吵', '乘坐', '成功', '成为', '诚实', '吃惊', '重新', '抽烟', '出差', '出发', '出生', '出现', '厨师', '传真', '窗户', '词典', '从来', '粗心',
    '存', '错误', '答案', '打扮', '打针', '大概', '大使馆', '大约', '戴', '代表', '代替', '袋', '当', '导游', '到处', '到底', '道歉', '得意', '登机牌', '等',
    '低', '底', '地址', '地球', '掉', '调查', '丢', '动作', '堵车', '肚子', '对面', '对于', '儿童', '而', '发生', '发展', '法律', '翻译', '烦恼', '反对',
    '方法', '方面', '方向', '房东', '仿佛', '放弃', '放暑假', '份', '丰富', '否则', '符合', '付款', '负责', '复印', '复杂', '改变', '干', '干杯', '赶', '感动',
    '感觉', '感情', '感谢', '钢琴', '高速公路', '各', '工资', '共同', '够', '购物', '估计', '顾客', '故意', '挂', '关键', '管理', '光', '广播', '广告', '逛',
    '规定', '国籍', '国际', '果然', '过程', '海洋', '害羞', '寒冷', '航班', '好处', '号', '合格', '合适', '盒', '后悔', '厚', '互联网', '互相', '护士', '怀疑',
    '回忆', '活动', '活泼', '火', '获得', '积极', '积累', '基础', '激动', '及时', '即使', '计划', '记者', '技术', '既然', '继续', '加班', '加油站', '家具', '假',
    '价格', '坚持', '减肥', '减少', '建议', '将来', '奖金', '降低', '交', '交流', '交通', '郊区', '骄傲', '饺子', '教授', '教育', '接受', '接着', '结果', '节约',
    '解释', '尽管', '紧', '紧张', '进行', '禁止', '京剧', '经济', '经历', '经验', '精彩', '竟然', '竞争', '镜子', '究竟', '举', '举办', '举行', '拒绝', '距离',
    '聚会', '开玩笑', '看法', '考虑', '科学', '咳嗽', '可怜', '可是', '可惜', '客厅', '肯定', '空', '空气', '恐怕', '苦', '矿泉水', '困', '困难', '垃圾', '辣',
    '来不及', '来得及', '来自', '浪费', '浪漫', '老虎', '理发', '理解', '理想', '力气', '例如', '厉害', '利用', '连', '联系', '凉快', '亮', '零钱', '领导', '流利',
    '流行', '留', '乱', '律师', '麻烦', '马虎', '满', '毛', '美丽', '梦', '迷路', '密码', '免费', '民族', '目的', '耐心', '难道', '难受', '内', '内容',
    '能力', '年龄', '农村', '弄', '暖和', '偶尔', '排列', '排球', '判断', '陪', '批评', '皮肤', '脾气', '篇', '骗', '乒乓球', '平时', '破', '葡萄', '普遍',
    '普通话', '其次', '气候', '千万', '签证', '敲', '桥', '巧克力', '亲戚', '轻', '轻松', '情况', '穷', '区别', '取', '全部', '缺点', '缺少', '却', '确实',
    '然而', '热闹', '任何', '任务', '仍然', '日记', '入口', '散步', '森林', '沙发', '杀', '伤心', '商量', '稍微', '勺子', '社会', '申请', '深', '甚至', '生活',
    '生命', '生意', '省', '剩', '失败', '失望', '师傅', '十分', '实际', '实在', '使', '使用', '是否', '适合', '适应', '收', '收入', '收拾', '首都', '首先',
    '受不了', '受到', '售货员', '输', '熟悉', '数量', '数字', '帅', '顺便', '顺利', '顺序', '说明', '硕士', '死', '速度', '塑料袋', '随便', '随着', '孙子', '所有',
    '台', '抬', '态度', '谈', '弹钢琴', '汤', '糖', '躺', '讨论', '讨厌', '特点', '提', '提供', '提前', '提醒', '填空', '条件', '停', '挺', '通过',
    '通知', '同情', '推', '推迟', '脱', '袜子', '完全', '网球', '网站', '往往', '危险', '卫生间', '味道', '温度', '文章', '污染', '无', '无聊', '无论', '误会',
    '西红柿', '吸引', '咸', '现金', '羡慕', '相反', '相同', '详细', '响', '橡皮', '象', '消息', '小吃', '小伙子', '小说', '笑话', '效果', '心情', '辛苦', '信封',
    '信任', '行', '醒', '幸福', '性别', '性格', '修理', '许多', '学期', '压力', '牙膏', '呀', '亚洲', '严格', '严重', '研究', '盐', '眼镜', '演出', '演员',
    '阳光', '养成', '样子', '邀请', '要是', '钥匙', '也许', '叶子', '页', '一切', '以', '以后', '以及', '以来', '艺术', '意见', '因此', '引起', '印象', '赢',
    '永远', '勇敢', '优点', '优秀', '幽默', '尤其', '由', '由于', '邮局', '友好', '友谊', '有趣', '于是', '与', '羽毛球', '语法', '语言', '预习', '原来', '原谅',
    '原因', '约会', '阅读', '允许', '杂志', '咱们', '暂时', '脏', '责任', '增加', '增长', '窄', '占线', '招聘', '真正', '整理', '整齐', '正常', '正好', '正确',
    '正式', '证明', '之', '支持', '知识', '直接', '值得', '职业', '植物', '只好', '指', '质量', '至少', '制造', '中文', '钟', '重', '重点', '周围', '主意',
    '祝', '祝贺', '著名', '专门', '专业', '转', '准确', '仔细', '自然', '总结', '租', '最好', '尊重', '座', '座位', '做生意',
  ];

  // HSK 5 and 6 would be even longer - abbreviated here
  const hsk5 = [
    '爱护', '爱惜', '安慰', '暗', '熬夜', '把握', '摆', '班主任', '办理', '傍晚', '包裹', '包含', '包子', '宝贝', '宝贵', '保持', '保存', '保留', '保险', '报告',
    '报社', '悲观', '背', '背景', '被子', '本科', '本领', '本质', '比例', '彼此', '必然', '必要', '避免', '编辑', '鞭炮', '便', '辩论', '标点', '标志', '表达',
    '表面', '表明', '表情', '表现', '冰激凌', '病毒', '玻璃', '播放', '脖子', '博物馆', '补充', '不安', '不必', '不断', '不见得', '不耐烦', '不然', '不如', '不足', '布',
  ];

  const hsk6 = [
    '挨', '癌症', '爱不释手', '爱戴', '安宁', '安详', '安置', '暗示', '昂贵', '熬', '奥秘', '巴不得', '巴结', '把关', '把手', '罢工', '霸道', '掰', '摆脱', '败坏',
    '拜访', '拜年', '拜托', '颁布', '颁发', '半途而废', '扮演', '绑架', '榜样', '包庇', '包袱', '包围', '包装', '饱和', '饱经沧桑', '保管', '保密', '保姆', '保守', '保卫',
  ];

  // Assign levels
  hsk1.forEach(w => hskWords[w] = 1);
  hsk2.forEach(w => hskWords[w] = 2);
  hsk3.forEach(w => hskWords[w] = 3);
  hsk4.forEach(w => hskWords[w] = 4);
  hsk5.forEach(w => hskWords[w] = 5);
  hsk6.forEach(w => hskWords[w] = 6);

  fs.writeFileSync(outputPath, JSON.stringify(hskWords));
  console.log(`HSK data built: ${Object.keys(hskWords).length} words`);
}

async function buildRadicalMeanings(): Promise<void> {
  console.log('Building radical meanings...');

  const outputPath = path.join(DATA_DIR, 'radicals.json');

  const radicals: Record<string, string> = {
    '一': 'one', '丨': 'line', '丶': 'dot', '丿': 'slash', '乙': 'second', '亅': 'hook',
    '二': 'two', '亠': 'lid', '人': 'person', '亻': 'person', '儿': 'legs', '入': 'enter',
    '八': 'eight', '冂': 'border', '冖': 'cover', '冫': 'ice', '几': 'table', '凵': 'container',
    '刀': 'knife', '刂': 'knife', '力': 'power', '勹': 'wrap', '匕': 'spoon', '匚': 'box',
    '匸': 'hiding', '十': 'ten', '卜': 'divination', '卩': 'seal', '厂': 'cliff', '厶': 'private',
    '又': 'again', '口': 'mouth', '囗': 'enclosure', '土': 'earth', '士': 'scholar', '夂': 'go',
    '夊': 'go slowly', '夕': 'evening', '大': 'big', '女': 'woman', '子': 'child', '宀': 'roof',
    '寸': 'inch', '小': 'small', '尢': 'lame', '尸': 'corpse', '屮': 'sprout', '山': 'mountain',
    '巛': 'river', '工': 'work', '己': 'self', '巾': 'cloth', '干': 'dry', '幺': 'thread',
    '广': 'shelter', '廴': 'stride', '廾': 'hands', '弋': 'arrow', '弓': 'bow', '彐': 'pig snout',
    '彡': 'hair', '彳': 'step', '心': 'heart', '忄': 'heart', '戈': 'halberd', '戶': 'door',
    '户': 'door', '手': 'hand', '扌': 'hand', '支': 'branch', '攴': 'knock', '攵': 'knock',
    '文': 'literature', '斗': 'dipper', '斤': 'axe', '方': 'square', '无': 'not', '日': 'sun',
    '曰': 'say', '月': 'moon', '木': 'tree', '欠': 'yawn', '止': 'stop', '歹': 'death',
    '殳': 'weapon', '毋': 'do not', '比': 'compare', '毛': 'fur', '氏': 'clan', '气': 'air',
    '水': 'water', '氵': 'water', '氺': 'water', '火': 'fire', '灬': 'fire', '爪': 'claw',
    '爫': 'claw', '父': 'father', '爻': 'lines', '爿': 'split wood', '片': 'slice', '牙': 'tooth',
    '牛': 'cow', '牜': 'cow', '犬': 'dog', '犭': 'dog', '玄': 'dark', '玉': 'jade',
    '王': 'king', '瓜': 'melon', '瓦': 'tile', '甘': 'sweet', '生': 'life', '用': 'use',
    '田': 'field', '疋': 'cloth bolt', '疒': 'sickness', '癶': 'footsteps', '白': 'white', '皮': 'skin',
    '皿': 'dish', '目': 'eye', '矛': 'spear', '矢': 'arrow', '石': 'stone', '示': 'spirit',
    '礻': 'spirit', '禸': 'track', '禾': 'grain', '穴': 'cave', '立': 'stand', '竹': 'bamboo',
    '⺮': 'bamboo', '米': 'rice', '糸': 'silk', '纟': 'silk', '缶': 'jar', '网': 'net',
    '罒': 'net', '羊': 'sheep', '羽': 'feather', '老': 'old', '而': 'and', '耒': 'plow',
    '耳': 'ear', '聿': 'brush', '肉': 'meat', '月': 'meat', '臣': 'minister', '自': 'self',
    '至': 'arrive', '臼': 'mortar', '舌': 'tongue', '舛': 'oppose', '舟': 'boat', '艮': 'stopping',
    '色': 'color', '艸': 'grass', '艹': 'grass', '虍': 'tiger', '虫': 'insect', '血': 'blood',
    '行': 'walk', '衣': 'clothes', '衤': 'clothes', '襾': 'cover', '見': 'see', '见': 'see',
    '角': 'horn', '言': 'speech', '讠': 'speech', '谷': 'valley', '豆': 'bean', '豕': 'pig',
    '豸': 'cat', '貝': 'shell', '贝': 'shell', '赤': 'red', '走': 'run', '足': 'foot',
    '⻊': 'foot', '身': 'body', '車': 'cart', '车': 'cart', '辛': 'bitter', '辰': 'morning',
    '辵': 'walk', '辶': 'walk', '邑': 'city', '阝': 'city/mound', '酉': 'wine', '釆': 'distinguish',
    '里': 'village', '金': 'metal', '钅': 'metal', '長': 'long', '长': 'long', '門': 'gate',
    '门': 'gate', '阜': 'mound', '隶': 'slave', '隹': 'bird', '雨': 'rain', '青': 'blue-green',
    '非': 'wrong', '面': 'face', '革': 'leather', '韋': 'leather', '韦': 'leather', '韭': 'leek',
    '音': 'sound', '頁': 'head', '页': 'head', '風': 'wind', '风': 'wind', '飛': 'fly',
    '飞': 'fly', '食': 'food', '饣': 'food', '首': 'head', '香': 'fragrance', '馬': 'horse',
    '马': 'horse', '骨': 'bone', '高': 'high', '髟': 'hair', '鬥': 'fight', '鬯': 'herbs',
    '鬲': 'cauldron', '鬼': 'ghost', '魚': 'fish', '鱼': 'fish', '鳥': 'bird', '鸟': 'bird',
    '鹵': 'salt', '卤': 'salt', '鹿': 'deer', '麥': 'wheat', '麦': 'wheat', '麻': 'hemp',
    '黃': 'yellow', '黄': 'yellow', '黍': 'millet', '黑': 'black', '黹': 'embroidery', '黽': 'frog',
    '黾': 'frog', '鼎': 'tripod', '鼓': 'drum', '鼠': 'rat', '鼻': 'nose', '齊': 'even',
    '齐': 'even', '齒': 'tooth', '齿': 'tooth', '龍': 'dragon', '龙': 'dragon', '龜': 'turtle',
    '龟': 'turtle', '龠': 'flute',
  };

  fs.writeFileSync(outputPath, JSON.stringify(radicals));
  console.log(`Radical meanings built: ${Object.keys(radicals).length} radicals`);
}

async function main(): Promise<void> {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  await buildCedict();
  await buildUnihanData();
  await buildHskData();
  await buildRadicalMeanings();

  console.log('Dictionary build complete!');
}

main().catch(console.error);
